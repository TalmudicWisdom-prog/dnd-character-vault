import { useState, type ChangeEvent } from "react";
import { PageHeader } from "../../components/PageHeader";
import { createVaultBackup, downloadBackup, restoreVaultBackup, validateVaultBackup, type RestoreMode, type VaultBackup } from "../../storage/backups";

export function BackupRestorePage() {
  const [status, setStatus] = useState("");
  const [backup, setBackup] = useState<VaultBackup | null>(null);
  const [mode, setMode] = useState<RestoreMode>("merge-skip");

  const exportBackup = async (includePdfs: boolean) => {
    setStatus(includePdfs ? "Preparing full local backup..." : "Preparing lightweight local backup...");
    try {
      const created = await createVaultBackup(includePdfs);
      await downloadBackup(created);
      setStatus("Backup ready. Choose a location using the system save or share sheet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not export backup");
    }
  };

  const chooseBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus("Validating backup before making changes...");
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      setBackup(await validateVaultBackup(parsed));
      setStatus("Backup is valid. Choose how to restore it.");
    } catch (error) {
      setBackup(null);
      setStatus(error instanceof Error ? error.message : "This backup is invalid");
    }
  };

  const restore = async () => {
    if (!backup) return;
    if (mode === "new" && !window.confirm("Replace the current vault with this backup? Current records not in the backup will be permanently removed.")) return;
    if (mode === "merge-replace" && !window.confirm("Replace matching records with backup versions?")) return;
    setStatus("Restoring validated local backup...");
    try {
      await restoreVaultBackup(backup, mode);
      setStatus("Restore complete. Character ownership and PDF associations were validated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not restore backup");
    }
  };

  return (
    <section className="page">
      <PageHeader eyebrow="Vault tools" title="Backup & Restore" description="Create and restore user-controlled files. Nothing is uploaded or synced automatically." actions={<a className="primary-button button-link" href="#import">Import character sheet</a>} />
      <div className="tool-grid">
        <article className="panel tool-card">
          <span className="card-label">Export</span><h2>Lightweight vault backup</h2>
          <p>Characters, sheets, notes, inventory, spellbooks, custom modules, PDF metadata, bookmarks, and settings. PDF files are omitted.</p>
          <button className="primary-button" onClick={() => void exportBackup(false)} type="button">Export without PDFs</button>
        </article>
        <article className="panel tool-card">
          <span className="card-label">Export</span><h2>Full vault backup</h2>
          <p>Includes everything in the lightweight backup plus locally stored PDF files. Large libraries create very large JSON files.</p>
          <button className="secondary-button" onClick={() => void exportBackup(true)} type="button">Export with PDFs</button>
        </article>
      </div>
      <article className="panel restore-panel">
        <div><span className="card-label">Import</span><h2>Restore a vault backup</h2><p>The file is fully validated, checksummed, and checked for character ownership before existing data changes.</p></div>
        <label className="file-button secondary-button">Choose backup file<input accept="application/json,.json" onChange={(event) => void chooseBackup(event)} type="file" /></label>
        {backup && <div className="restore-options">
          <label className="touch-toggle"><input checked={mode === "merge-skip"} onChange={() => setMode("merge-skip")} type="radio" /><span>Merge and skip duplicates</span></label>
          <label className="touch-toggle"><input checked={mode === "merge-replace"} onChange={() => setMode("merge-replace")} type="radio" /><span>Merge and replace matching records</span></label>
          <label className="touch-toggle"><input checked={mode === "new"} onChange={() => setMode("new")} type="radio" /><span>Restore as new vault</span></label>
          <button className={mode === "new" ? "secondary-button danger-button" : "primary-button"} onClick={() => void restore()} type="button">Restore validated backup</button>
        </div>}
      </article>
      {status && <p className="panel inline-message tool-status" role="status">{status}</p>}
    </section>
  );
}
