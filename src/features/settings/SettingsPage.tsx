import { useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import type { AppSettings, ThemePreference } from "../../domain/models";
import { getSettings, updateSettings } from "../../storage/database";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  const save = async (next: Partial<Pick<AppSettings, "theme" | "backupReminders">>) => {
    const updated = await updateSettings(next);
    setSettings(updated);
    document.documentElement.dataset.theme = updated.theme;
    setSaved("Saved locally");
    window.setTimeout(() => setSaved(""), 1800);
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
