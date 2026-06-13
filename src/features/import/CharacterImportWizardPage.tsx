import { useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import type { CharacterImportDraft, ImportField, ImportSaveMode } from "../../domain/import";
import type { AbilityId } from "../../domain/models";
import { extractCharacterText } from "../../import/extract";
import { readCharacterSheetSource } from "../../import/readSource";
import { saveCharacterImport } from "../../import/saveImport";
import { abilityIds, skillIds } from "../../storage/characterSheets";
import { db } from "../../storage/database";

const abilityLabels: Record<AbilityId, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };

function ReviewField({ label, field, onChange, type = "text" }: { label: string; field: ImportField<string | number>; onChange: (field: ImportField<string | number>) => void; type?: "text" | "number" }) {
  return <label className={field.needsReview ? "review-field needs-review" : "review-field"}>
    <span className="review-field-heading"><input checked={field.include} onChange={(event) => onChange({ ...field, include: event.target.checked })} type="checkbox" />{label}{field.needsReview && <small>Needs Review</small>}</span>
    <input disabled={!field.include} onChange={(event) => onChange({ ...field, value: type === "number" ? Number(event.target.value) : event.target.value, needsReview: false })} type={type} value={field.value} />
  </label>;
}

export function CharacterImportWizardPage() {
  const characters = useLiveQuery(() => db.characters.toArray(), []) ?? [];
  const [draft, setDraft] = useState<CharacterImportDraft | null>(null);
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState<ImportSaveMode>("create");
  const [targetId, setTargetId] = useState("");

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDraft(null);
    try {
      const rawText = await readCharacterSheetSource(file, setStatus);
      setDraft(extractCharacterText(rawText, file.name));
      setStatus("Extraction complete. Review every selected field before saving.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read this character sheet");
    }
  };

  const update = <Key extends keyof CharacterImportDraft>(key: Key, value: CharacterImportDraft[Key]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const save = async () => {
    if (!draft) return;
    if (mode === "merge" && !targetId) return setStatus("Choose a character to merge into.");
    if (mode === "merge" && !window.confirm("Merge the selected reviewed fields into this character? Existing values are changed only for checked fields.")) return;
    setStatus("Saving reviewed fields locally...");
    try {
      const characterId = await saveCharacterImport(draft, mode, targetId);
      window.location.hash = `sheet/${characterId}`;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save import");
    }
  };

  return <section className="page import-page">
    <PageHeader eyebrow="Offline character tools" title="Character Sheet Import" description="Upload a PDF or photo. Text extraction and OCR run only in this browser, then you review every change before saving." actions={<a className="secondary-button button-link" href="#tools">Backup & Restore</a>} />
    {!draft ? <article className="panel import-start">
      <div><span className="card-label">Step 1</span><h2>Choose a character sheet</h2><p>Text PDFs are read directly. Scanned PDFs and images use the bundled offline OCR engine. No file is sent anywhere.</p></div>
      <label className="file-drop"><span>Choose PDF or photo</span><small>PDF, PNG, JPEG, WebP, HEIC where supported by the browser</small><input accept="application/pdf,image/*" onChange={(event) => void chooseFile(event)} type="file" /></label>
    </article> : <>
      <article className="panel import-destination">
        <div><span className="card-label">Step 2</span><h2>Choose destination</h2><p>Merge never changes an unchecked field.</p></div>
        <div className="destination-controls">
          <label className="touch-toggle"><input checked={mode === "create"} onChange={() => setMode("create")} type="radio" /><span>Create new character</span></label>
          <label className="touch-toggle"><input checked={mode === "merge"} onChange={() => setMode("merge")} type="radio" /><span>Merge into existing character</span></label>
          {mode === "merge" && <select onChange={(event) => setTargetId(event.target.value)} value={targetId}><option value="">Choose character...</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select>}
        </div>
      </article>
      <article className="panel import-review">
        <div className="form-section-heading"><div><span className="card-label">Step 3</span><h2>Review extracted fields</h2><p>Uncheck anything to skip it. Editing a field clears its review warning.</p></div><button className="primary-button" onClick={() => void save()} type="button">Save reviewed import</button></div>
        <div className="review-grid">
          <ReviewField field={draft.name} label="Character name" onChange={(value) => update("name", value as ImportField<string>)} />
          <ReviewField field={draft.playerName} label="Player name" onChange={(value) => update("playerName", value as ImportField<string>)} />
          <ReviewField field={draft.level} label="Level" onChange={(value) => update("level", value as ImportField<number>)} type="number" />
          <ReviewField field={draft.characterClass} label="Class / classes" onChange={(value) => update("characterClass", value as ImportField<string>)} />
          <ReviewField field={draft.ancestry} label="Species / ancestry" onChange={(value) => update("ancestry", value as ImportField<string>)} />
          <ReviewField field={draft.background} label="Background" onChange={(value) => update("background", value as ImportField<string>)} />
          <ReviewField field={draft.currentHp} label="Current HP" onChange={(value) => update("currentHp", value as ImportField<number>)} type="number" />
          <ReviewField field={draft.maxHp} label="Max HP" onChange={(value) => update("maxHp", value as ImportField<number>)} type="number" />
          <ReviewField field={draft.armorClass} label="Armor Class" onChange={(value) => update("armorClass", value as ImportField<number>)} type="number" />
          <ReviewField field={draft.initiative} label="Initiative" onChange={(value) => update("initiative", value as ImportField<number>)} type="number" />
          <ReviewField field={draft.speed} label="Speed" onChange={(value) => update("speed", value as ImportField<number>)} type="number" />
        </div>
        <h3 className="review-subheading">Ability Scores</h3>
        <div className="ability-grid">{abilityIds.map((ability) => <ReviewField field={draft.abilityScores[ability]} key={ability} label={abilityLabels[ability]} onChange={(value) => update("abilityScores", { ...draft.abilityScores, [ability]: value as ImportField<number> })} type="number" />)}</div>
        <div className="import-check-columns">
          <section><h3>Skills</h3>{skillIds.map((skill) => <label className="proficiency-row" key={skill}><input checked={draft.skills[skill].include} onChange={(event) => update("skills", { ...draft.skills, [skill]: { ...draft.skills[skill], include: event.target.checked, value: event.target.checked } })} type="checkbox" /><span>{skill}</span>{draft.skills[skill].needsReview && <small>Needs Review</small>}</label>)}</section>
          <section><h3>Saving Throws</h3>{abilityIds.map((ability) => <label className="proficiency-row" key={ability}><input checked={draft.savingThrows[ability].include} onChange={(event) => update("savingThrows", { ...draft.savingThrows, [ability]: { ...draft.savingThrows[ability], include: event.target.checked, value: event.target.checked } })} type="checkbox" /><span>{abilityLabels[ability]}</span>{draft.savingThrows[ability].needsReview && <small>Needs Review</small>}</label>)}</section>
        </div>
        {(["inventory", "features"] as const).map((key) => <label className={draft[key].needsReview ? "form-field full-width needs-review" : "form-field full-width"} key={key}><span><input checked={draft[key].include} onChange={(event) => update(key, { ...draft[key], include: event.target.checked })} type="checkbox" /> {key === "inventory" ? "Inventory / items" : "Features / traits"} {draft[key].needsReview && <small>Needs Review</small>}</span><textarea disabled={!draft[key].include} onChange={(event) => update(key, { ...draft[key], value: event.target.value.split("\n"), needsReview: false })} rows={8} value={draft[key].value.join("\n")} /></label>)}
        <label className={draft.spellsAndNotes.needsReview ? "form-field full-width needs-review" : "form-field full-width"}><span><input checked={draft.spellsAndNotes.include} onChange={(event) => update("spellsAndNotes", { ...draft.spellsAndNotes, include: event.target.checked })} type="checkbox" /> Spells / notes {draft.spellsAndNotes.needsReview && <small>Needs Review</small>}</span><textarea disabled={!draft.spellsAndNotes.include} onChange={(event) => update("spellsAndNotes", { ...draft.spellsAndNotes, value: event.target.value, needsReview: false })} rows={10} value={draft.spellsAndNotes.value} /></label>
        <details className="raw-import-text"><summary>View locally extracted raw text</summary><pre>{draft.rawText}</pre></details>
      </article>
    </>}
    {status && <p className="panel inline-message tool-status" role="status">{status}</p>}
  </section>;
}
