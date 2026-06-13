import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { SoulReaperProgression } from "../../domain/models";
import { soulReaperLevels, soulReaperFeaturesAtLevel, soulReaperPathLabels } from "../../domain/soulReaper";
import { db } from "../../storage/database";
import { attachSoulReaperPdf, createSoulReaperProgression, saveSoulReaperProgression } from "../../storage/soulReaper";

export function SoulReaperSection({ characterId, characterLevel }: { characterId: string; characterLevel: number }) {
  const stored = useLiveQuery(async () => (await db.soulReaperProgressions.get(characterId)) ?? null, [characterId]);
  const sourcePdf = useLiveQuery(() => stored?.sourcePdfId ? db.pdfDocuments.get(stored.sourcePdfId) : undefined, [stored?.sourcePdfId]);
  const [progression, setProgression] = useState<SoulReaperProgression | null>(null);
  const [status, setStatus] = useState("Saved locally");
  const editVersion = useRef(0);

  useEffect(() => {
    if (stored && status === "Saved locally") setProgression(stored);
  }, [status, stored]);

  useEffect(() => {
    if (!progression || status !== "Unsaved changes") return;
    const timer = window.setTimeout(async () => {
      const version = editVersion.current;
      setStatus("Saving locally...");
      try {
        const saved = await saveSoulReaperProgression(progression);
        if (editVersion.current === version) {
          setProgression(saved);
          setStatus("Saved locally");
        } else {
          setStatus("Unsaved changes");
        }
      } catch {
        setStatus("Could not save");
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [progression, status]);

  const edit = (change: (current: SoulReaperProgression) => SoulReaperProgression) => {
    editVersion.current += 1;
    setProgression((current) => current ? change(current) : current);
    setStatus("Unsaved changes");
  };

  const addProgression = async () => {
    setStatus("Saving locally...");
    const created = await createSoulReaperProgression(characterId);
    setProgression(created);
    setStatus("Saved locally");
  };

  const attachPdf = async (file: File | undefined) => {
    if (!file || !progression) return;
    setStatus("Storing source PDF locally...");
    try {
      const updated = await attachSoulReaperPdf(progression, file);
      setProgression(updated);
      setStatus("Source PDF stored locally");
    } catch {
      setStatus("Could not store source PDF");
    }
  };

  if (stored === undefined) return null;
  if (stored === null && !progression) {
    return (
      <article className="panel sheet-section soul-reaper-empty">
        <div><span className="card-label">Optional character progression</span><h2>Soul Reaper</h2><p>Add the Soul Reaper class track from your DM's guide. It levels independently from the character's normal level.</p></div>
        <button className="primary-button" onClick={() => void addProgression()} type="button">Add Soul Reaper progression</button>
      </article>
    );
  }
  if (!progression) return null;

  const level = soulReaperLevels[progression.level - 1];
  const nextLevel = soulReaperLevels[progression.level] ?? null;
  const unlocked = soulReaperLevels.flatMap((row) => row.level <= progression.level
    ? soulReaperFeaturesAtLevel(row.level, progression.path).map((feature) => ({ level: row.level, feature }))
    : []);
  const slots = level.spellSlots.map((count, index) => count ? `${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"}: ${count}` : null).filter(Boolean);

  return (
    <article className="panel sheet-section soul-reaper-section">
      <div className="form-section-heading">
        <div><span className="card-label">DM-granted class track</span><h2>Soul Reaper</h2><p>Character level {characterLevel} · Soul Reaper level {progression.level}</p></div>
        <span className="save-state">{status}</span>
      </div>

      <div className="soul-level-controls">
        <button className="touch-step-button" disabled={progression.level <= 1} onClick={() => edit((current) => ({ ...current, level: current.level - 1 }))} type="button">−</button>
        <label className="soul-level-field"><span>Soul Reaper level</span><input max={20} min={1} onChange={(event) => edit((current) => ({ ...current, level: Math.min(20, Math.max(1, Number(event.target.value))) }))} type="number" value={progression.level} /></label>
        <button className="touch-step-button" disabled={progression.level >= 20} onClick={() => edit((current) => ({ ...current, level: current.level + 1 }))} type="button">+</button>
      </div>

      <div className="soul-stat-grid">
        <div><span>Proficiency</span><strong>{level.proficiency}</strong></div>
        <div><span>Soul Dice</span><strong>{level.soulDice}</strong></div>
        <label><span>Souls held</span><input max={level.soulsHeld ?? undefined} min={0} onChange={(event) => edit((current) => ({ ...current, currentSouls: Number(event.target.value) }))} type="number" value={progression.currentSouls} /><small>Maximum {level.soulsHeld ?? "—"}</small></label>
        <div><span>Undead</span><strong>{level.undead ?? "—"}</strong></div>
      </div>

      <div className="soul-detail-grid">
        <section>
          <span className="card-label">Current level gains</span>
          <h3>Level {level.level}</h3>
          <ul>{soulReaperFeaturesAtLevel(level.level, progression.path).map((feature) => <li key={feature}>{feature}</li>)}</ul>
          <p><strong>Spell slots:</strong> {slots.length ? slots.join(" · ") : "None"}</p>
        </section>
        <section>
          <span className="card-label">Next level</span>
          {nextLevel ? <><h3>Level {nextLevel.level}</h3><ul>{soulReaperFeaturesAtLevel(nextLevel.level, progression.path).map((feature) => <li key={feature}>{feature}</li>)}</ul><p>{nextLevel.soulDice} Soul Dice · {nextLevel.soulsHeld ?? "—"} souls held</p></> : <><h3>Level 20 reached</h3><p>Avatar of Death is unlocked.</p></>}
        </section>
      </div>

      <div className="soul-options-grid">
        <label className="form-field"><span>Reaper Path</span><select disabled={progression.level < 3} onChange={(event) => edit((current) => ({ ...current, path: event.target.value as SoulReaperProgression["path"] }))} value={progression.path}>{Object.entries(soulReaperPathLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>{progression.level < 3 ? "Choose a path at Soul Reaper level 3." : "Path features appear in unlocked and next-level lists."}</small></label>
        <div className="source-pdf-control">
          <span className="form-field-label">Soul Reaper source PDF</span>
          {sourcePdf ? <a className="secondary-button button-link" href={`#pdf/${sourcePdf.id}`}>Open {sourcePdf.name}</a> : <label className="secondary-button button-link file-button">Attach source PDF<input accept="application/pdf,.pdf" onChange={(event) => void attachPdf(event.target.files?.[0])} type="file" /></label>}
          <small>{sourcePdf ? "Stored locally and associated with this character." : "The PDF will be stored locally and linked only to this character."}</small>
        </div>
      </div>

      <details className="soul-unlocked">
        <summary>All unlocked Soul Reaper features ({unlocked.length})</summary>
        <div>{unlocked.map(({ level: featureLevel, feature }) => <p key={`${featureLevel}-${feature}`}><strong>Level {featureLevel}</strong><span>{feature}</span></p>)}</div>
      </details>

      <label className="form-field full-width"><span>Soul Reaper notes</span><textarea onChange={(event) => edit((current) => ({ ...current, notes: event.target.value }))} placeholder="Path decisions, soul uses, rulings from your DM..." rows={5} value={progression.notes} /></label>
    </article>
  );
}
