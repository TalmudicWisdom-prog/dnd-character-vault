import { db } from '../storage/database';
import type { OutboxEntry } from './CloudSyncProvider';

/**
 * Append a mutation to the outbox queue
 * @param entry The mutation entry without id and status
 */
export const appendToOutbox = async (entry: Omit<OutboxEntry, 'id' | 'status'>): Promise<void> => {
  const outboxEntry: OutboxEntry = {
    ...entry,
    id: crypto.randomUUID(),
    status: 'pending'
  };
  await db.table('syncOutbox').add(outboxEntry);
};

/**
 * Get all pending outbox entries, grouped by characterId
 * @returns Map of characterId to array of pending outbox entries
 */
export const getPendingOutboxEntries = async (): Promise<Map<string, OutboxEntry[]>> => {
  const allEntries = await db.table('syncOutbox').toArray() as OutboxEntry[];
  const pendingEntries = allEntries.filter(entry => entry.status === 'pending');
  
  const grouped = new Map<string, OutboxEntry[]>();
  for (const entry of pendingEntries) {
    if (!grouped.has(entry.characterId)) {
      grouped.set(entry.characterId, []);
    }
    grouped.get(entry.characterId)!.push(entry);
  }
  return grouped;
};

/**
 * Mark outbox entries as synced after successful push
 * @param entryIds Array of outbox entry IDs to mark as synced
 */
export const markOutboxSynced = async (entryIds: string[]): Promise<void> => {
  await db.transaction('rw', db.table('syncOutbox'), async () => {
    const table = db.table('syncOutbox');
    for (const id of entryIds) {
      await table.update(id, { status: 'synced' });
    }
  });
};

/**
 * Mark outbox entries as failed
 * @param entryIds Array of outbox entry IDs to mark as failed
 */
export const markOutboxFailed = async (entryIds: string[]): Promise<void> => {
  await db.transaction('rw', db.table('syncOutbox'), async () => {
    const table = db.table('syncOutbox');
    for (const id of entryIds) {
      await table.update(id, { status: 'failed' });
    }
  });
};

/**
 * Remove synced entries older than the given age
 * @param maxAgeMs Maximum age in milliseconds (default 24 hours)
 * @returns Number of deleted entries
 */
export const pruneOutbox = async (maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> => {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  
  let deletedCount = 0;
  await db.transaction('rw', db.table('syncOutbox'), async () => {
    const table = db.table('syncOutbox');
    const allEntries = await table.toArray();
    const idsToDelete = allEntries
      .filter((entry: OutboxEntry) => entry.status === 'synced' && entry.timestamp < cutoff)
      .map((entry: OutboxEntry) => entry.id);
      
    if (idsToDelete.length > 0) {
      await table.bulkDelete(idsToDelete);
      deletedCount = idsToDelete.length;
    }
  });
  
  return deletedCount;
};

/**
 * Get count of pending entries (for UI badge)
 * @returns Count of pending outbox entries
 */
export const getPendingCount = async (): Promise<number> => {
  const allEntries = await db.table('syncOutbox').toArray() as OutboxEntry[];
  return allEntries.filter(entry => entry.status === 'pending').length;
};

/**
 * Clear all outbox entries (used on disconnect)
 */
export const clearOutbox = async (): Promise<void> => {
  await db.table('syncOutbox').clear();
};
