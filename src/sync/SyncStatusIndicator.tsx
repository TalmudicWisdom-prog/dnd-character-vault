import { useState, useEffect } from 'react';
import type { SyncState } from './CloudSyncProvider';
import { syncEngine } from './SyncEngine';
import { getPendingCount } from './outbox';

/*
CSS for this component (add to global.css):

.sync-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.85rem;
  cursor: default;
  user-select: none;
}
.sync-status-indicator.idle { opacity: 0.35; }
.sync-status-indicator.syncing { animation: sync-pulse 1.5s ease-in-out infinite; }
.sync-status-indicator.error { color: #ffb86c; opacity: 0.9; }
.sync-status-indicator .sync-badge {
  background: #ff5555;
  color: white;
  border-radius: 10px;
  padding: 0 0.3em;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.4;
}
@keyframes sync-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
*/

/**
 * Ambient sync status indicator.
 * Shows a subtle cloud icon reflecting the current sync state.
 * Renders nothing when no provider is connected.
 */
export function SyncStatusIndicator() {
  const [state, setState] = useState<SyncState>(syncEngine.getState());
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const update = async () => {
      setState(syncEngine.getState());
      setPending(await getPendingCount());
    };

    void update();

    const unsubscribe = syncEngine.addEventListener(() => {
      void update();
    });

    return unsubscribe;
  }, []);

  // Don't render when no provider is connected
  if (!syncEngine.getProvider()) return null;

  const isSyncing = state === 'pushing' || state === 'pulling' || state === 'merging' || state === 'debouncing';
  const isError = state === 'error' || state === 'conflict-review';

  if (isError) {
    return (
      <span className="sync-status-indicator error" title="Sync error — tap Settings to reconnect">
        ☁️⚠
      </span>
    );
  }

  if (isSyncing) {
    return (
      <span className="sync-status-indicator syncing" title="Syncing…">
        ☁️⇅
      </span>
    );
  }

  if (pending > 0) {
    return (
      <span className="sync-status-indicator" title={`${pending} pending change${pending !== 1 ? 's' : ''}`}>
        ☁️⏳
        <span className="sync-badge">{pending}</span>
      </span>
    );
  }

  return (
    <span className="sync-status-indicator idle" title="Synced">
      ☁️
    </span>
  );
}
