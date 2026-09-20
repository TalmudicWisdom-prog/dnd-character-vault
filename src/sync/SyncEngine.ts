import type {
  CloudSyncProvider,
  SyncState,
  SyncResult,
  SyncError,
  SyncEvent,
  SyncEventListener,
  SyncMetadata,
  SyncLogEntry,
  CharacterSyncBundle,
  OutboxEntry,
} from './CloudSyncProvider';
import { getPendingOutboxEntries, markOutboxSynced, markOutboxFailed, pruneOutbox, getPendingCount } from './outbox';
import { getTombstonesForCharacter, applyRemoteTombstones, pruneTombstones } from './tombstones';
import { assembleBundle, disassembleBundle, serializeBundle, deserializeBundle } from './bundler';
import { syncPortraitAsset, hydratePortrait, extractPortraitHash } from './assets';
import { threeWayMerge, createConflictFork } from './merge';
import { registerSyncHooks, unregisterSyncHooks, suppressHooks } from './hooks';
import { db } from '../storage/database';

export class SyncEngine {
  private provider: CloudSyncProvider | null = null;
  private state: SyncState = 'idle';
  private syncInProgress = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<SyncEventListener> = new Set();
  private syncLog: SyncLogEntry[] = [];
  private metadata: SyncMetadata | null = null;

  // Debounce window: 3 seconds after last local change
  private static readonly DEBOUNCE_MS = 3000;
  // Max sync log entries to keep
  private static readonly MAX_LOG_ENTRIES = 50;
  // Retry backoff base
  private static readonly RETRY_BASE_MS = 5000;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Get current sync state */
  getState(): SyncState {
    return this.state;
  }

  /** Get the connected provider, or null */
  getProvider(): CloudSyncProvider | null {
    return this.provider;
  }

  /** Get recent sync log entries */
  getSyncLog(): readonly SyncLogEntry[] {
    return this.syncLog;
  }

  /** Get count of pending outbox entries */
  async getPendingCount(): Promise<number> {
    return await getPendingCount();
  }

  // ── Event System ──

  /** Subscribe to sync events. Returns unsubscribe function. */
  addEventListener(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in sync event listener', err);
      }
    }
  }

  private setState(next: SyncState): void {
    if (this.state === next) return;
    this.state = next;
    this.emit({ type: 'state-change', state: next });
  }

  private addLogEntry(action: SyncLogEntry['action'], message: string, characterIds?: string[]): void {
    const entry: SyncLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      message,
      characterIds
    };
    this.syncLog.unshift(entry);
    if (this.syncLog.length > SyncEngine.MAX_LOG_ENTRIES) {
      this.syncLog.pop();
    }
  }

  // ── Connection Management ──

  /**
   * Connect to a cloud sync provider.
   * Initializes metadata, registers Dexie hooks, and triggers initial sync.
   */
  async connect(provider: CloudSyncProvider): Promise<void> {
    this.provider = provider;
    await this.loadOrCreateMetadata();
    registerSyncHooks();
    this.addLogEntry('connect', `Connected to ${provider.displayName}`);
    // Trigger initial sync
    void this.sync();
  }

  /**
   * Disconnect from the current provider.
   * Clears outbox, unregisters hooks, revokes auth.
   */
  async disconnect(): Promise<void> {
    if (this.provider) {
      try {
        if (typeof (this.provider as any).disconnect === 'function') {
          await (this.provider as any).disconnect();
        }
      } catch (err) {
        console.error('Failed to disconnect provider', err);
      }
    }
    
    unregisterSyncHooks();
    
    try {
      if (db.table('outbox')) {
        await db.table('outbox').clear();
      }
    } catch (err) {
      console.warn('Could not clear outbox on disconnect', err);
    }
    
    this.provider = null;
    this.metadata = null;
    this.addLogEntry('disconnect', 'Disconnected from sync provider');
    this.setState('idle');
  }

  // ── Metadata ──

  private async loadOrCreateMetadata(): Promise<void> {
    try {
      const metadata = await db.table('syncMetadata').get('sync');
      if (metadata) {
        this.metadata = metadata;
      } else {
        this.metadata = {
          deviceId: crypto.randomUUID(),
          lastSyncedAt: new Date().toISOString(),
          ancestorSnapshots: {},
        };
        await db.table('syncMetadata').put(this.metadata, 'sync');
      }
    } catch (err) {
      console.warn('Failed to load sync metadata, creating new', err);
      this.metadata = {
        deviceId: crypto.randomUUID(),
        lastSyncedAt: new Date().toISOString(),
        ancestorSnapshots: {},
      };
    }
  }

  private async saveMetadata(): Promise<void> {
    if (this.metadata) {
      try {
        await db.table('syncMetadata').put(this.metadata, 'sync');
      } catch (err) {
        console.error('Failed to save sync metadata', err);
      }
    }
  }

  // ── Debounced Sync Trigger ──

  /**
   * Called by Dexie hooks (indirectly via outbox) when local data changes.
   * Debounces: waits 3 seconds after the last change, then syncs.
   */
  notifyLocalChange(): void {
    if (!this.provider || !navigator.onLine) return;
    this.setState('debouncing');
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.sync();
    }, SyncEngine.DEBOUNCE_MS);
  }

  // ── Core Sync Cycle ──

  /**
   * Execute a full sync cycle: push local changes, then pull remote changes.
   * This is the main entry point for sync operations.
   */
  async sync(): Promise<SyncResult> {
    if (!this.provider || this.syncInProgress) {
      return { pushed: 0, pulled: 0, conflicts: [], errors: [] };
    }
    if (!navigator.onLine) {
      return { pushed: 0, pulled: 0, conflicts: [], errors: [{ message: 'Offline', code: 'network', retryable: true }] };
    }

    this.syncInProgress = true;
    const result: SyncResult = { pushed: 0, pulled: 0, conflicts: [], errors: [] };

    try {
      // Ensure auth is valid
      if (!this.provider.isAuthenticated()) {
        try { await this.provider.refreshToken(); }
        catch {
          this.emit({ type: 'auth-expired', providerId: this.provider.id });
          this.setState('error');
          return result;
        }
      }

      // Phase 1: Push
      this.setState('pushing');
      const pushResult = await this.pushLocalChanges();
      result.pushed = pushResult.pushed;
      result.conflicts.push(...pushResult.conflicts);
      result.errors.push(...pushResult.errors);

      // Phase 2: Pull
      this.setState('pulling');
      const pullResult = await this.pullRemoteChanges();
      result.pulled = pullResult.pulled;
      result.conflicts.push(...pullResult.conflicts);
      result.errors.push(...pullResult.errors);

      // Phase 3: Cleanup
      await pruneOutbox();
      await pruneTombstones();

      // Update metadata
      if (this.metadata) {
        this.metadata.lastSyncedAt = new Date().toISOString();
        await this.saveMetadata();
      }

      // Log results
      if (result.pushed > 0) this.addLogEntry('push', `Pushed ${result.pushed} character(s)`);
      if (result.pulled > 0) this.addLogEntry('pull', `Pulled ${result.pulled} update(s)`);
      for (const cid of result.conflicts) {
        this.addLogEntry('conflict', `Conflict on character — copy created`, [cid]);
      }

      this.retryCount = 0;
      this.emit({ type: 'sync-complete', result });
      this.setState('idle');
    } catch (err) {
      const syncError: SyncError = {
        message: err instanceof Error ? err.message : 'Unknown sync error',
        code: 'unknown',
        retryable: true,
      };
      result.errors.push(syncError);
      this.addLogEntry('error', syncError.message);
      this.emit({ type: 'error', error: syncError });
      this.setState('error');
      this.scheduleRetry();
    } finally {
      this.syncInProgress = false;
    }

    return result;
  }

  // ── Push Logic ──

  private async pushLocalChanges(): Promise<{ pushed: number; conflicts: string[]; errors: SyncError[] }> {
    const pending = await getPendingOutboxEntries();
    let pushed = 0;
    const conflicts: string[] = [];
    const errors: SyncError[] = [];

    for (const [characterId, entries] of pending) {
      try {
        // Get tombstones for this character
        const tombstones = await getTombstonesForCharacter(characterId);
        
        // Extract portrait hash
        const character = await db.characters.get(characterId);
        if (!character) {
          // Character was deleted — mark entries as synced
          await markOutboxSynced(entries.map(e => e.id));
          continue;
        }

        const portraitHash = await extractPortraitHash(character.portraitDataUrl ?? '');
        
        // Sync portrait asset if present
        if (portraitHash && this.provider) {
          await syncPortraitAsset(this.provider, character.portraitDataUrl ?? '');
        }

        // Assemble the character bundle
        const bundle = await assembleBundle(characterId, tombstones, portraitHash);
        if (!bundle) continue;

        // Get the expected cloud revision for optimistic locking
        const expectedRev = this.metadata?.ancestorSnapshots[characterId]?.cloudRev;

        // Serialize and upload
        const data = serializeBundle(bundle);
        try {
          const { rev } = await this.provider!.writeFile(
            `characters/${characterId}.json`,
            data,
            { expectedRev, contentType: 'application/json' },
          );

          // Success: update ancestor snapshot
          if (this.metadata) {
            this.metadata.ancestorSnapshots[characterId] = { bundle, cloudRev: rev };
          }
          await markOutboxSynced(entries.map(e => e.id));
          pushed++;
        } catch (err) {
          // Check for conflict error (409)
          if (err instanceof Error && err.message.includes('conflict')) {
            conflicts.push(characterId);
            await this.handlePushConflict(characterId, bundle);
          } else {
            throw err;
          }
        }
      } catch (err) {
        const entryIds = entries.map(e => e.id);
        await markOutboxFailed(entryIds);
        errors.push({
          characterId,
          message: err instanceof Error ? err.message : 'Push failed',
          code: 'provider',
          retryable: true,
        });
      }
    }

    // Update manifest
    if (pushed > 0 && this.provider) {
      await this.updateManifest();
    }

    return { pushed, conflicts, errors };
  }

  // ── Pull Logic ──

  private async pullRemoteChanges(): Promise<{ pulled: number; conflicts: string[]; errors: SyncError[] }> {
    if (!this.provider || !this.metadata) return { pulled: 0, conflicts: [], errors: [] };

    let pulled = 0;
    const conflicts: string[] = [];
    const errors: SyncError[] = [];

    // Read remote manifest
    const remoteManifest = await this.provider.readManifest();
    if (!remoteManifest) return { pulled, conflicts, errors };

    // Compare each remote character against local state
    for (const remote of remoteManifest.characters) {
      const ancestor = this.metadata.ancestorSnapshots[remote.id];
      
      // Skip if we already have this version
      if (ancestor && ancestor.bundle.updatedAt >= remote.updatedAt) continue;

      try {
        // Download the remote bundle
        const { data, rev } = await this.provider.readFile(`characters/${remote.id}.json`);
        const remoteBundle = deserializeBundle(data);

        // Check if character exists locally
        const localChar = await db.characters.get(remote.id);

        if (!localChar) {
          // New character from another device — import it
          const portraitDataUrl = remoteBundle.portrait.assetHash
            ? await hydratePortrait(this.provider, remoteBundle.portrait.assetHash)
            : '';
          await suppressHooks(() => disassembleBundle(remoteBundle, portraitDataUrl));
          // Apply tombstones
          if (remoteBundle.tombstones.length > 0) {
            await suppressHooks(() => applyRemoteTombstones(remoteBundle.tombstones));
          }
          this.metadata.ancestorSnapshots[remote.id] = { bundle: remoteBundle, cloudRev: rev };
          pulled++;
          continue;
        }

        // Character exists locally — check for local changes
        const pendingEntries = await getPendingOutboxEntries();
        const hasLocalChanges = pendingEntries.has(remote.id);

        if (!hasLocalChanges && ancestor) {
          // No local changes: fast-forward to remote version
          const portraitDataUrl = remoteBundle.portrait.assetHash
            ? await hydratePortrait(this.provider, remoteBundle.portrait.assetHash)
            : localChar.portraitDataUrl ?? '';
          await suppressHooks(() => disassembleBundle(remoteBundle, portraitDataUrl));
          if (remoteBundle.tombstones.length > 0) {
            await suppressHooks(() => applyRemoteTombstones(remoteBundle.tombstones));
          }
          this.metadata.ancestorSnapshots[remote.id] = { bundle: remoteBundle, cloudRev: rev };
          pulled++;
        } else if (hasLocalChanges && ancestor) {
          // Both local and remote have changes — MERGE
          this.setState('merging');
          const localTombstones = await getTombstonesForCharacter(remote.id);
          const localPortraitHash = await extractPortraitHash(localChar.portraitDataUrl ?? '');
          const localBundle = await assembleBundle(remote.id, localTombstones, localPortraitHash);
          if (!localBundle) continue;

          const mergeResult = threeWayMerge(ancestor.bundle, localBundle, remoteBundle);

          if (mergeResult.success && mergeResult.merged) {
            // Auto-merged successfully
            const portraitDataUrl = mergeResult.merged.portrait.assetHash
              ? await hydratePortrait(this.provider!, mergeResult.merged.portrait.assetHash)
              : localChar.portraitDataUrl ?? '';
            await suppressHooks(() => disassembleBundle(mergeResult.merged!, portraitDataUrl));
            // Push the merged version back to cloud
            const mergedData = serializeBundle(mergeResult.merged);
            const { rev: mergedRev } = await this.provider!.writeFile(
              `characters/${remote.id}.json`,
              mergedData,
              { contentType: 'application/json' },
            );
            this.metadata.ancestorSnapshots[remote.id] = { bundle: mergeResult.merged, cloudRev: mergedRev };
            // Clear local outbox for this character
            const localEntries = pendingEntries.get(remote.id) ?? [];
            await markOutboxSynced(localEntries.map(e => e.id));
            pulled++;
          } else {
            // Unresolvable conflict — fork
            const fork = createConflictFork(localBundle, localChar.name);
            // Write fork as a new local character
            const forkPortraitDataUrl = localChar.portraitDataUrl ?? '';
            await suppressHooks(() => disassembleBundle(fork, forkPortraitDataUrl));
            // Accept remote version for original
            const portraitDataUrl = remoteBundle.portrait.assetHash
              ? await hydratePortrait(this.provider!, remoteBundle.portrait.assetHash)
              : '';
            await suppressHooks(() => disassembleBundle(remoteBundle, portraitDataUrl));
            this.metadata.ancestorSnapshots[remote.id] = { bundle: remoteBundle, cloudRev: rev };
            conflicts.push(remote.id);
            this.emit({ type: 'conflict', characterId: remote.id, characterName: localChar.name });
            // Clear local outbox
            const localEntries = pendingEntries.get(remote.id) ?? [];
            await markOutboxSynced(localEntries.map(e => e.id));
            pulled++;
          }
        } else {
          // No ancestor: treat remote as authoritative (first sync on this device)
          const portraitDataUrl = remoteBundle.portrait.assetHash
            ? await hydratePortrait(this.provider, remoteBundle.portrait.assetHash)
            : localChar.portraitDataUrl ?? '';
          await suppressHooks(() => disassembleBundle(remoteBundle, portraitDataUrl));
          this.metadata.ancestorSnapshots[remote.id] = { bundle: remoteBundle, cloudRev: rev };
          pulled++;
        }
      } catch (err) {
        errors.push({
          characterId: remote.id,
          message: err instanceof Error ? err.message : 'Pull failed',
          code: 'provider',
          retryable: true,
        });
      }
    }

    // Check for characters deleted remotely
    // Characters in our ancestor snapshots but NOT in remote manifest = deleted remotely
    if (this.metadata) {
      const remoteIds = new Set(remoteManifest.characters.map(c => c.id));
      for (const localId of Object.keys(this.metadata.ancestorSnapshots)) {
        if (!remoteIds.has(localId)) {
          // Deleted remotely — check if we have local pending changes
          const pendingEntries = await getPendingOutboxEntries();
          if (!pendingEntries.has(localId)) {
            // No local changes — safe to delete locally
            // We DON'T auto-delete. Instead just remove ancestor snapshot.
            // User keeps their local copy but it won't sync anymore.
            delete this.metadata.ancestorSnapshots[localId];
          }
        }
      }
    }

    await this.saveMetadata();
    return { pulled, conflicts, errors };
  }

  // ── Conflict Handling ──

  private async handlePushConflict(characterId: string, localBundle: CharacterSyncBundle): Promise<void> {
    // Fetch the remote version that caused the conflict
    // Then delegate to pullRemoteChanges logic for this character
    // This is handled by the next pull cycle
  }

  // ── Manifest ──

  private async updateManifest(): Promise<void> {
    if (!this.provider || !this.metadata) return;
    const characters = await db.characters.toArray();
    const manifest = {
      version: 1,
      lastSyncedAt: new Date().toISOString(),
      deviceId: this.metadata.deviceId,
      characters: characters
        .filter(c => !c.archivedAt) // Don't include archived characters in manifest
        .map(c => ({
          id: c.id,
          name: c.name,
          updatedAt: c.updatedAt,
          assetHashes: this.metadata!.ancestorSnapshots[c.id]?.bundle.portrait.assetHash
            ? [this.metadata!.ancestorSnapshots[c.id]!.bundle.portrait.assetHash!]
            : [],
        })),
    };
    await this.provider.writeManifest(manifest);
  }

  // ── Retry Logic ──

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = Math.min(SyncEngine.RETRY_BASE_MS * Math.pow(2, this.retryCount), 60000);
    this.retryCount++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (navigator.onLine) void this.sync();
    }, delay);
  }

  // ── Online/Offline Handling ──

  /** Call this on window 'online' event */
  onOnline(): void {
    if (this.provider) void this.sync();
  }

  /** Call this on window 'offline' event */
  onOffline(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.setState('idle');
  }

  /** Cleanup: call on app unmount */
  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.listeners.clear();
  }
}

// Singleton instance
export const syncEngine = new SyncEngine();
