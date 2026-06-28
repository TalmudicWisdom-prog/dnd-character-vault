import { useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import type { AppSettings, ThemePreference } from "../../domain/models";
import { getSettings, updateSettings } from "../../storage/database";
import { BUILD_ID, APP_VERSION } from "../../app/version";
import { checkForAppUpdate, hasWaitingUpdate, installWaitingUpdate, onUpdateAvailable } from "../../pwa/updates";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(hasWaitingUpdate());

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  useEffect(() => onUpdateAvailable(() => {
    setUpdateAvailable(true);
    setUpdateStatus("Update Available");
  }), []);

  const save = async (next: Partial<Pick<AppSettings, "theme" | "backupReminders" | "lastUpdateCheck">>) => {
    const updated = await updateSettings(next);
    setSettings(updated);
    document.documentElement.dataset.theme = updated.theme;
    setSaved("Saved locally");
    window.setTimeout(() => setSaved(""), 1800);
  };

  const checkUpdates = async () => {
    setUpdateStatus("Checking for updates...");
    const checkedAt = new Date().toISOString();
    const result = await checkForAppUpdate();
    await save({ lastUpdateCheck: checkedAt });
    setUpdateAvailable(result.available);
    setUpdateStatus(result.message);
  };

  const installUpdate = () => {
    setUpdateStatus("Installing update. Your local character data stays in IndexedDB.");
    if (!installWaitingUpdate()) setUpdateStatus("No downloaded update is waiting yet. Try Check for Updates first.");
  };

  return (
    <section className="page">
      <PageHeader
        eyebrow="Make it yours"
        title="Settings"
        description="Preferences are stored only in this browser."
      />

      <div className="settings-stack">
        <article className="panel setting-section">
          <div>
            <h2>Appearance</h2>
            <p>Choose how the vault looks on this device.</p>
          </div>
          <label className="select-field">
            <span>Theme</span>
            <select
              value={settings?.theme ?? "system"}
              onChange={(event) => void save({ theme: event.target.value as ThemePreference })}
            >
              <option value="system">Follow device</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </article>

        <article className="panel setting-section">
          <div>
            <h2>Backup reminders</h2>
            <p>Keep a gentle reminder visible once manual JSON backups are available.</p>
          </div>
          <label className="toggle">
            <input
              checked={settings?.backupReminders ?? true}
              onChange={(event) => void save({ backupReminders: event.target.checked })}
              type="checkbox"
            />
            <span aria-hidden="true" />
            <strong>{settings?.backupReminders ?? true ? "On" : "Off"}</strong>
          </label>
        </article>

        <article className="panel setting-section">
          <div>
            <h2>App updates</h2>
            <p>Updates are checked manually and never installed during gameplay unless you tap Install Now.</p>
            <p><strong>Version:</strong> {APP_VERSION} · <strong>Build:</strong> {BUILD_ID}</p>
            <p><strong>Last update check:</strong> {settings?.lastUpdateCheck ? new Date(settings.lastUpdateCheck).toLocaleString() : "Never"}</p>
            {updateStatus && <p className="inline-message" role="status">{updateStatus}</p>}
          </div>
          <div className="settings-action-stack">
            <button className="primary-button" onClick={() => void checkUpdates()} type="button">Check for Updates</button>
            {updateAvailable && <><button className="secondary-button" onClick={installUpdate} type="button">Install Now</button><button className="text-button" onClick={() => { setUpdateAvailable(false); setUpdateStatus("Update postponed. You can install later from Settings."); }} type="button">Later</button></>}
          </div>
        </article>

        <article className="panel setting-section">
          <div>
            <h2>Data and privacy</h2>
            <p>No accounts, analytics, tracking, or remote data storage are included.</p>
          </div>
          <span className="status-badge good">Local only</span>
        </article>

        <article className="panel setting-section">
          <div>
            <h2>About / Legal</h2>
            <p>View SRD attribution, source labels, and the no-endorsement notice.</p>
          </div>
          <a className="secondary-button button-link" href="#legal">Open Legal</a>
        </article>
      </div>

      {saved && <div className="save-toast" role="status">{saved}</div>}
    </section>
  );
}
