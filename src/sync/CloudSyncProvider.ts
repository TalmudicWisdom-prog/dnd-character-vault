/**
 * Core types and interfaces for the cloud sync engine.
 * Defines shared types used across the sync system.
 */

// ── Provider Interface ──

/**
 * Supported cloud storage providers.
 */
export type ProviderId = 'dropbox' | 'google-drive';

/**
 * Interface that all cloud storage providers must implement.
 * Handles authentication, basic file operations, and manifest management.
 */
export interface CloudSyncProvider {
  /** The unique identifier for the provider */
  readonly id: ProviderId;
  /** The human-readable name of the provider */
  readonly displayName: string;

  // Auth
  /** Checks if the provider is currently authenticated */
  isAuthenticated(): boolean;
  /** Gets the URL for the user to authenticate */
  getAuthUrl(): Promise<string>;
  /** Handles the callback from the authentication flow */
  handleAuthCallback(params: URLSearchParams): Promise<void>;
  /** Refreshes the authentication token */
  refreshToken(): Promise<void>;
  /** Disconnects the provider and removes authentication data */
  disconnect(): Promise<void>;

  // File Operations
  /** Lists files in a given folder */
  listFiles(folder: string): Promise<CloudFile[]>;
  /** Reads the contents of a file */
  readFile(path: string): Promise<{ data: ArrayBuffer; rev: string }>;
  /** Writes data to a file */
  writeFile(path: string, data: ArrayBuffer, opts?: WriteFileOptions): Promise<{ rev: string }>;
  /** Deletes a file */
  deleteFile(path: string): Promise<void>;
  /** Checks if a file exists */
  fileExists(path: string): Promise<boolean>;

  // Manifest
  /** Reads the sync manifest from the cloud */
  readManifest(): Promise<SyncManifest | null>;
  /** Writes the sync manifest to the cloud */
  writeManifest(manifest: SyncManifest): Promise<{ rev: string }>;
}

/**
 * Options for writing a file to the cloud provider.
 */
export interface WriteFileOptions {
  /** The expected revision of the file. Used for conflict detection. */
  expectedRev?: string;
  /** The MIME type of the file. */
  contentType?: string;
}

/**
 * Represents a file stored in the cloud.
 */
export interface CloudFile {
  /** The path to the file */
  path: string;
  /** The name of the file */
  name: string;
  /** The revision identifier of the file */
  rev: string;
  /** The last modified timestamp (ISO string) */
  modifiedAt: string;
  /** The size of the file in bytes */
  size: number;
}

// ── Sync Manifest (stored in cloud as manifest.json) ──

/**
 * The sync manifest stored in the cloud (manifest.json).
 * Tracks the state of all characters synced to the cloud.
 */
export interface SyncManifest {
  /** The schema version of the manifest */
  version: number;
  /** The timestamp of the last sync operation */
  lastSyncedAt: string;
  /** The device ID that last updated the manifest */
  deviceId: string;
  /** Entries for each character synced to the cloud */
  characters: SyncManifestEntry[];
}

/**
 * Represents a character entry in the sync manifest.
 */
export interface SyncManifestEntry {
  /** The character's UUID */
  id: string;
  /** The character's name */
  name: string;
  /** The last updated timestamp for the character */
  updatedAt: string;
  /** Hashes of assets associated with the character */
  assetHashes: string[];
}

// ── Character Sync Bundle (one per character, stored as {id}.json) ──

/**
 * A bundle containing all data for a single character.
 * This is stored in the cloud as {id}.json.
 */
export interface CharacterSyncBundle {
  /** The format version of the bundle */
  formatVersion: 1;
  /** The character's UUID */
  characterId: string;
  /** Max of all related table updatedAt values */
  updatedAt: string;
  /** Serialized Character (without portraitDataUrl) */
  character: Record<string, unknown>;
  /** Serialized CharacterSheet */
  sheet: Record<string, unknown> | null;
  /** The character's inventory (containers and items) */
  inventory: {
    containers: Record<string, unknown>[];
    items: Record<string, unknown>[];
  };
  /** Serialized Spellbook */
  spellbook: Record<string, unknown> | null;
  /** Spells in the spellbook */
  spells: Record<string, unknown>[];
  /** Soul Reaper progression, if applicable */
  soulReaperProgression: Record<string, unknown> | null;
  /** PDF document metadata */
  pdfDocuments: Record<string, unknown>[];
  /** Bookmarks in PDF documents */
  pdfBookmarks: Record<string, unknown>[];
  /** Portrait data */
  portrait: {
    /** Asset hash of the portrait image */
    assetHash: string | null;
    /** Transform applied to the portrait */
    transform: Record<string, unknown>;
  };
  /** Tombstones representing deleted records */
  tombstones: SyncTombstoneRecord[];
}

// ── Outbox Entry (tracks local mutations for sync push) ──

/**
 * Tracks local mutations that need to be pushed to the cloud.
 */
export interface OutboxEntry {
  /** Unique ID for the outbox entry */
  id: string;
  /** The character ID associated with the mutation */
  characterId: string;
  /** The table that was mutated */
  tableName: string;
  /** The ID of the mutated record */
  recordId: string;
  /** The type of operation performed */
  operation: 'create' | 'update' | 'delete';
  /** The timestamp of the operation */
  timestamp: string;
  /** The sync status of the mutation */
  status: 'pending' | 'synced' | 'failed';
}

// ── Tombstone (tracks deletions for cross-device propagation) ──

/**
 * Tracks deleted records to ensure deletions propagate across devices.
 */
export interface SyncTombstoneRecord {
  /** Unique ID for the tombstone */
  id: string;
  /** The character ID the deleted record belonged to */
  characterId: string;
  /** The table the record was deleted from */
  tableName: string;
  /** The ID of the deleted record */
  recordId: string;
  /** The timestamp when the record was deleted */
  deletedAt: string;
}

// ── Sync Metadata (singleton stored locally in IndexedDB) ──

/**
 * Local sync metadata stored in IndexedDB.
 * Used to track sync state across sessions.
 */
export interface SyncMetadata {
  /** Singleton ID, usually 'sync' */
  id: 'sync';
  /** This device's unique identifier */
  deviceId: string;
  /** The active cloud provider ID, if any */
  providerId: ProviderId | null;
  /** Timestamp of the last successful sync */
  lastSyncedAt: string | null;
  /** Authentication data for the cloud provider */
  providerAuth: StoredProviderAuth | null;
  /** Snapshots of character bundles used for 3-way merge */
  ancestorSnapshots: Record<string, AncestorSnapshot>;
}

/**
 * A snapshot of a character bundle from the cloud, used as a base for 3-way merges.
 */
export interface AncestorSnapshot {
  /** The character bundle snapshot */
  bundle: CharacterSyncBundle;
  /** The revision identifier of the snapshot in the cloud */
  cloudRev: string;
}

/**
 * Stored authentication data for a cloud provider.
 */
export interface StoredProviderAuth {
  /** The provider the auth data is for */
  providerId: ProviderId;
  /** Refresh token, mainly for Dropbox */
  refreshToken?: string;
  /** The access token */
  accessToken: string;
  /** The expiration time of the access token */
  expiresAt: string;
  /** The client ID used for auth */
  clientId: string;
}

// ── Sync Engine State ──

/**
 * Possible states of the sync engine.
 */
export type SyncState =
  | 'idle'
  | 'debouncing'
  | 'pushing'
  | 'pulling'
  | 'merging'
  | 'conflict-review'
  | 'error';

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  /** Number of items pushed to the cloud */
  pushed: number;
  /** Number of items pulled from the cloud */
  pulled: number;
  /** IDs of characters that had conflicts during sync */
  conflicts: string[];
  /** Errors encountered during sync */
  errors: SyncError[];
}

/**
 * Represents an error encountered during sync operations.
 */
export interface SyncError {
  /** Character ID associated with the error, if any */
  characterId?: string;
  /** Error message */
  message: string;
  /** Error code */
  code: 'auth_expired' | 'network' | 'conflict' | 'provider' | 'unknown';
  /** Whether the operation can be retried */
  retryable: boolean;
}

// ── Sync Log Entry (for UI display in settings) ──

/**
 * Represents an entry in the sync log, for displaying history in the UI.
 */
export interface SyncLogEntry {
  /** Unique ID for the log entry */
  id: string;
  /** Timestamp of the event */
  timestamp: string;
  /** Type of action logged */
  action: 'push' | 'pull' | 'conflict' | 'error' | 'connect' | 'disconnect';
  /** Description of the event */
  message: string;
  /** Associated character IDs, if any */
  characterIds?: string[];
}

// ── Sync Event (for UI reactivity) ──

/**
 * Events emitted by the sync engine, for UI reactivity.
 */
export type SyncEvent =
  | { type: 'state-change'; state: SyncState }
  | { type: 'sync-complete'; result: SyncResult }
  | { type: 'conflict'; characterId: string; characterName: string }
  | { type: 'auth-expired'; providerId: ProviderId }
  | { type: 'error'; error: SyncError };

/**
 * Listener function for sync events.
 */
export type SyncEventListener = (event: SyncEvent) => void;
