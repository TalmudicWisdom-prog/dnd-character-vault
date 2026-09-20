import { db } from '../storage/database';
import { appendToOutbox } from './outbox';
import { recordTombstone } from './tombstones';

/**
 * List of tables that participate in cloud sync.
 * We do not sync local-only data like settings or drafts.
 */
const SYNCED_TABLES = [
  'characters',
  'characterSheets', 
  'inventoryContainers',
  'inventoryItems',
  'spellbooks',
  'spells',
  'soulReaperProgressions',
  'pdfDocuments',
  'pdfBookmarks',
] as const;

/** Whether sync hooks should actually process mutations */
let hooksActive = false;

/** Whether we have attached the Dexie hook listeners to the tables */
let hooksAttached = false;

/** Whether to suppress hooks (used during sync pull to avoid feedback loops) */
let hooksSuppressed = false;

/**
 * Resolve the characterId(s) from a record in any synced table.
 * Returns an array because pdfDocuments can be linked to multiple characters.
 * 
 * @param tableName Name of the table
 * @param primKey The primary key of the record
 * @param obj The record object
 * @returns Array of character UUIDs
 */
function resolveCharacterIds(tableName: string, primKey: unknown, obj: unknown): string[] {
  if (!obj) return [];
  const record = obj as Record<string, any>;

  switch (tableName) {
    case 'characters':
      return [String(primKey)];
    case 'characterSheets':
    case 'spellbooks':
    case 'soulReaperProgressions':
      return [String(primKey)];
    case 'inventoryContainers':
    case 'inventoryItems':
    case 'spells':
      return record.characterId ? [String(record.characterId)] : [];
    case 'pdfDocuments':
      return Array.isArray(record.characterIds) ? record.characterIds.map(String) : [];
    case 'pdfBookmarks':
      // We skip pdfBookmarks in the outbox.
      // Since bookmarks are tied to documents, the bundler will include them 
      // automatically when syncing the document, avoiding the need for an async lookup here.
      return [];
    default:
      return [];
  }
}

/**
 * Register mutation hooks on all synced tables.
 * Safe to call multiple times — hooks are only registered once.
 */
export function registerSyncHooks(): void {
  hooksActive = true;
  if (hooksAttached) return;
  hooksAttached = true;

  for (const tableName of SYNCED_TABLES) {
    const table = db.table(tableName);

    table.hook('creating', (primKey, obj) => {
      if (!hooksActive || hooksSuppressed) return;
      
      const characterIds = resolveCharacterIds(tableName, primKey, obj);
      if (characterIds.length === 0) return;
      
      const timestamp = new Date().toISOString();
      for (const characterId of characterIds) {
        void appendToOutbox({
          characterId,
          tableName,
          recordId: String(primKey),
          operation: 'create',
          timestamp,
        });
      }
    });

    table.hook('updating', (modifications, primKey, obj) => {
      if (!hooksActive || hooksSuppressed) return;
      
      const updatedObj = { ...obj, ...modifications };
      const characterIds = resolveCharacterIds(tableName, primKey, updatedObj);
      if (characterIds.length === 0) return;

      const timestamp = new Date().toISOString();
      for (const characterId of characterIds) {
        void appendToOutbox({
          characterId,
          tableName,
          recordId: String(primKey),
          operation: 'update',
          timestamp,
        });
      }
    });

    table.hook('deleting', (primKey, obj) => {
      if (!hooksActive || hooksSuppressed) return;
      
      const characterIds = resolveCharacterIds(tableName, primKey, obj);
      if (characterIds.length === 0) return;

      const timestamp = new Date().toISOString();
      for (const characterId of characterIds) {
        void recordTombstone(characterId, tableName, String(primKey));

        void appendToOutbox({
          characterId,
          tableName,
          recordId: String(primKey),
          operation: 'delete',
          timestamp,
        });
      }
    });
  }
}

/**
 * Unregister all mutation hooks.
 * Called when the user disconnects their cloud provider.
 */
export function unregisterSyncHooks(): void {
  hooksActive = false;
}

/**
 * Temporarily suppress hooks during sync pull operations.
 * When pulling remote changes and writing them to Dexie,
 * we don't want those writes to be logged as outbox entries.
 * 
 * @param fn The async operation to perform while hooks are suppressed
 * @returns The result of the provided operation
 */
export async function suppressHooks<T>(fn: () => Promise<T>): Promise<T> {
  const previousState = hooksSuppressed;
  hooksSuppressed = true;
  try {
    return await fn();
  } finally {
    hooksSuppressed = previousState;
  }
}
