import { useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import {
  formatBytes,
  readStorageDiagnostics,
  requestPersistentStorage,
  type StorageDiagnostics,
} from "../../storage/diagnostics";

export function StorageDiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<StorageDiagnostics | null>(null);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    setDiagnostics(await readStorageDiagnostics());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const requestPersistence = async () => {
    const granted = await requestPersistentStorage();
    setMessage(granted ? "Persistent storage is enabled." : "The browser did not grant persistent storage.");
    await refresh();
  };

  const usagePercent =
    diagnostics?.usage != null && diagnostics.quota
      ? Math.min((diagnostics.usage / diagnostics.quota) * 100, 100)
      : 0;

  return (
    <section className="page">
      <PageHeader
        eyebrow="Device health"
        title="Storage diagnostics"
        description="See how the browser is protecting this local vault."
        actions={<button className="secondary-button" onClick={() => void refresh()}>Refresh</button>}
      />

      <div className="diagnostic-grid">
        <article className="panel">
          <span className="card-label">Offline app readiness</span>
          <div className="status-row">
            <span className={diagnostics?.offlineCacheReady ? "status-badge good" : "status-badge warning"}>
              {diagnostics?.offlineCacheReady ? "Ready offline" : "Not ready"}
            </span>
          </div>
          <p>
            {diagnostics?.offlineCacheReady
              ? `${diagnostics.offlineFileCount} app files are stored for offline launch.`
              : "Open the HTTPS installer while online and wait for the offline app files to finish loading."}
          </p>
          <p>
            HTTPS: {diagnostics?.secureContext ? "yes" : "no"} · Service worker:{" "}
            {diagnostics?.serviceWorkerControlled ? "active" : diagnostics?.serviceWorkerSupported ? "waiting" : "unsupported"} ·
            Home Screen mode: {diagnostics?.installedDisplayMode ? "yes" : "no"}
          </p>
        </article>

        <article className="panel storage-overview">
          <span className="card-label">Estimated local storage</span>
          <div className="storage-numbers">
            <strong>{formatBytes(diagnostics?.usage ?? null)}</strong>
            <span>used of {formatBytes(diagnostics?.quota ?? null)}</span>
          </div>
          <div className="meter" aria-label={`${usagePercent.toFixed(1)}% of estimated storage used`}>
            <span style={{ width: `${usagePercent}%` }} />
          </div>
          <p>Browser estimates include all data used by this app, including offline files.</p>
        </article>

        <article className="panel">
          <span className="card-label">Storage protection</span>
          <div className="status-row">
            <span className={diagnostics?.persisted ? "status-badge good" : "status-badge warning"}>
              {diagnostics?.persisted ? "Persistent" : "Best effort"}
            </span>
          </div>
          <p>Persistent storage reduces the chance that the browser removes local data automatically.</p>
          {!diagnostics?.persisted && (
            <button className="primary-button compact" onClick={() => void requestPersistence()}>
              Request protection
            </button>
          )}
          {message && <p className="inline-message" role="status">{message}</p>}
        </article>
      </div>

      <article className="panel guidance-panel">
        <div>
          <span className="card-label">Important</span>
          <h2>Local data needs a backup habit</h2>
        </div>
        <p>Clearing browser data or deleting the installed app can remove this vault. Use Vault Tools to create a lightweight or full manual backup file.</p>
        <a className="primary-button button-link" href="#tools">Open Backup & Restore</a>
      </article>
    </section>
  );
}
