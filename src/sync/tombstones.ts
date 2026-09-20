import { db } from '../storage/database';
import type { SyncTombstoneRecord } from './CloudSyncProvider';

/**
 * Record a deletion in the tombstone table
 * @param characterId Character ID
 * @param tableName Table name where deletion occurred
 * @param recordId Record ID that was deleted
 */
export const recordTombstone = async (
  characterId: string,
  tableName: string,
  recordId: string,
): Promise<void> => {
  const tombstone: SyncTombstoneRecord = {
    id: crypto.randomUUID(),
    characterId,
    tableName,
    recordId,
    deletedAt: new Date().toISOString()
  };
  
  await db.table('syncTombstones').add(tombstone);
};

/**
 * Get all tombstones for a character (for inclusion in sync bundle)
 * @param characterId Character ID
 * @returns Array of tombstone records
 */
export const getTombstonesForCharacter = async (characterId: string): Promise<SyncTombstoneRecord[]> => {
  const allTombstones = await db.table('syncTombstones').toArray() as SyncTombstoneRecord[];
  return allTombstones.filter(t => t.characterId === characterId);
};

/**
 * Apply remote tombstones: delete the referenced local records
 * @param tombstones Array of remote tombstone records
 */
export const applyRemoteTombstones = async (tombstones: SyncTombstoneRecord[]): Promise<void> => {
  if (tombstones.length === 0) return;

  const availableTableNames = db.tables.map(t => t.name);
  const tablesToAccessNames = [...new Set(tombstones.map(t => t.tableName))]
    .filter(name => availableTableNames.includes(name));
  
  const tablesToAccess = tablesToAccessNames.map(name => db.table(name));
  const syncTombstonesTable = db.table('syncTombstones');

  await db.transaction('rw', [...tablesToAccess, syncTombstonesTable], async () => {
    for (const tombstone of tombstones) {
      if (tablesToAccessNames.includes(tombstone.tableName)) {
        await db.table(tombstone.tableName).delete(tombstone.recordId);
      }
      
      // Store the remote tombstone locally to track that it's been processed
      await syncTombstonesTable.put(tombstone);
    }
  });
};

/**
 * Remove tombstones older than maxAge
 * @param maxAgeMs Maximum age in milliseconds (default 90 days)
 * @returns Number of deleted tombstones
 */
export const pruneTombstones = async (maxAgeMs: number = 90 * 24 * 60 * 60 * 1000): Promise<number> => {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  
  let deletedCount = 0;
  await db.transaction('rw', db.table('syncTombstones'), async () => {
    const table = db.table('syncTombstones');
    const allTombstones = await table.toArray();
    const idsToDelete = allTombstones
      .filter((t: SyncTombstoneRecord) => t.deletedAt < cutoff)
      .map((t: SyncTombstoneRecord) => t.id);
      
    if (idsToDelete.length > 0) {
      await table.bulkDelete(idsToDelete);
      deletedCount = idsToDelete.length;
    }
  });
  
  return deletedCount;
};

/**
 * Clear all tombstones (used on disconnect)
 */
export const clearTombstones = async (): Promise<void> => {
  await db.table('syncTombstones').clear();
};
