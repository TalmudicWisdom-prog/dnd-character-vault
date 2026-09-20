import { useState, useEffect, useCallback } from 'react';
import type { SyncState, SyncLogEntry, ProviderId } from './CloudSyncProvider';
import { syncEngine } from './SyncEngine';
import { getPendingCount } from './outbox';

/**
 * Cloud Sync settings panel.
 * Renders inside the SettingsPage to allow the user to connect/disconnect
 * cloud providers, trigger manual sync, and view the sync log.
 */
export function SyncSettingsPanel() {
  const [state, setState] = useState<SyncState>('idle');
  const [logs, setLogs] = useState<readonly SyncLogEntry[]>([]);
  const [pending, setPending] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('dropbox');
  const [autoSync, setAutoSync] = useState(true);
  const [syncPortraits, setSyncPortraits] = useState(true);

  const isConnected = syncEngine.getProvider() !== null;

  const refresh = useCallback(async () => {
    setState(syncEngine.getState());
    setLogs(syncEngine.getSyncLog().slice(-10));
    setPending(await getPendingCount());
  }, []);

  useEffect(() => {
    void refresh();

    const unsubscribe = syncEngine.addEventListener((event) => {
      void refresh();
    });

    return unsubscribe;
  }, [refresh]);

  const handleDisconnect = async () => {
    try {
      await syncEngine.disconnect();
      void refresh();
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  };

  const handleSyncNow = async () => {
    try {
      await syncEngine.sync();
      void refresh();
    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  const isSyncing = state === 'pushing' || state === 'pulling' || state === 'merging' || state === 'debouncing';
  const providerName = syncEngine.getProvider()?.displayName ?? null;

  return (
    <article className="panel setting-section">
      <div>
        <h2>Cloud Sync</h2>
        <p>Sync your characters across devices using your own cloud storage.</p>
      </div>

      {/* Connection status */}
      <div>
        {isConnected ? (
          <>
            <span className="status-badge good">● Connected to {providerName}</span>
            {state !== 'idle' && (
              <p className="inline-message" role="status">
                {state === 'pushing' && 'Pushing changes…'}
                {state === 'pulling' && 'Pulling updates…'}
                {state === 'merging' && 'Merging changes…'}
                {state === 'debouncing' && 'Waiting for edits to settle…'}
                {state === 'error' && '⚠ Sync error — will retry'}
                {state === 'conflict-review' && '⚠ Conflict detected'}
              </p>
            )}
          </>
        ) : (
          <span className="status-badge">Not connected</span>
        )}
      </div>

      {/* Pending changes count */}
      {isConnected && pending > 0 && (
        <p className="inline-message" role="status">
          {pending} pending change{pending !== 1 ? 's' : ''} waiting to sync
        </p>
      )}

      {/* Provider selection (only when disconnected) */}
      {!isConnected && (
        <div>
          <label className="select-field">
            <span>Provider</span>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as ProviderId)}
            >
              <option value="dropbox">Dropbox (Recommended)</option>
              <option value="google-drive" disabled>Google Drive (Coming Soon)</option>
            </select>
          </label>
          <p className="inline-message">
            Dropbox app key required. This will be configured during deployment.
          </p>
        </div>
      )}

      {/* Sync options */}
      {isConnected && (
        <div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
            />
            <span aria-hidden="true" />
            <strong>{autoSync ? 'Auto-sync on' : 'Auto-sync off'}</strong>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={syncPortraits}
              onChange={(e) => setSyncPortraits(e.target.checked)}
            />
            <span aria-hidden="true" />
            <strong>{syncPortraits ? 'Portraits synced' : 'Portraits skipped'}</strong>
          </label>
        </div>
      )}

      {/* Action buttons */}
      <div className="settings-action-stack">
        {isConnected ? (
          <>
            <button
              className="primary-button"
              onClick={() => void handleSyncNow()}
              disabled={isSyncing}
              type="button"
            >
              {isSyncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <button
              className="secondary-button"
              onClick={() => void handleDisconnect()}
              type="button"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button className="primary-button" disabled type="button">
            Connect {selectedProvider === 'dropbox' ? 'Dropbox' : 'Google Drive'}
          </button>
        )}
      </div>

      {/* Sync log */}
      {isConnected && logs.length > 0 && (
        <div>
          <h3>Sync Log</h3>
          <ul className="sync-log-list" style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', opacity: 0.8 }}>
            {logs.map((entry) => (
              <li key={entry.id} style={{ marginBottom: '0.25rem' }}>
                <span style={{ opacity: 0.5, marginRight: '0.5rem' }}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                {entry.action === 'push' && '⬆ '}
                {entry.action === 'pull' && '⬇ '}
                {entry.action === 'conflict' && '⚠ '}
                {entry.action === 'error' && '✖ '}
                {entry.action === 'connect' && '🔗 '}
                {entry.action === 'disconnect' && '🔌 '}
                {entry.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
