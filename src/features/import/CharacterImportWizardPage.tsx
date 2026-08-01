import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import type { CharacterImportDraft, ImportField, ImportMode, ImportParseResult, ImportSaveMode, ImportSession } from "../../domain/import";
import type { AbilityId } from "../../domain/models";
import { applyProviderConfidence, extractCharacterText } from "../../import/extract";
import { mergeImportResults } from "../../import/merge";
import { getImportProvider, getOnlineImportProvider } from "../../import/providers";
import { saveCharacterImport } from "../../import/saveImport";
import { cloneCharacterBackupForImport, restoreVaultBackup, validateVaultBackup } from "../../storage/backups";
import { abilityIds, skillIds } from "../../storage/characterSheets";
import { db } from "../../storage/database";
import { addImportFiles, createImportSession, discardImportSession, removeImportFile, reorderImportFile, updateImportSession } from "../../storage/importSessions";
import { activateCharacter, queueCharacterAnnouncement } from "../../app/activeCharacter";
import { BUILD_ID } from "../../app/version";
import { asImportParserError, describeImportFailure, type ImportFailure } from "../../import/importErrors";
import { reviewImportedSpells } from "../../import/spellPersistence";

const abilityLabels: Record<AbilityId, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
const confidenceLabel = (value: number | null) => value == null ? "" : `${Math.round(value * 100)}% confidence`;

function SourceInfo({ field }: { field: ImportField<unknown> }) {
  if (!field.sourceNames.length && field.confidence == null && !field.conflicts.length) return null;
  return <span className="import-source-info">
    {field.sourceNames.length > 0 && <small>From: {field.sourceNames.join(", ")}</small>}
    {field.confidence != null && <small>{confidenceLabel(field.confidence)}</small>}
    {field.conflicts.length > 0 && <small className="conflict-label">{field.conflicts.length + 1} conflicting values</small>}
  </span>;
}

function ReviewField({ label, field, onChange, type = "text" }: { label: string; field: ImportField<string | number>; onChange: (field: ImportField<string | number>) => void; type?: "text" | "number" }) {
  return <label className={field.needsReview ? "review-field needs-review" : "review-field"}>
    <span className="review-field-heading"><input checked={field.include} onChange={(event) => onChange({ ...field, include: event.target.checked })} type="checkbox" />{label}{field.needsReview && <small>Needs Review</small>}</span>
    <input disabled={!field.include} onChange={(event) => onChange({ ...field, value: type === "number" ? Number(event.target.value) : event.target.value, needsReview: false, conflicts: [] })} type={type} value={field.value} />
    <SourceInfo field={field} />
  </label>;
}

function fileTypeLabel(type: string, name: string) {
  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "PDF";
  return type.startsWith("image/") ? type.replace("image/", "").toUpperCase() + " image" : type || "File";
}

export function CharacterImportWizardPage() {
  const characters = useLiveQuery(() => db.characters.toArray(), []) ?? [];
  const session = useLiveQuery(() => db.importSessions.orderBy("updatedAt").reverse().first(), []) as ImportSession | undefined;
  const files = useLiveQuery(() => session ? db.importSessionFiles.where("sessionId").equals(session.id).toArray() : [], [session?.id]) ?? [];
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState<ImportSaveMode>("create");
  const [targetId, setTargetId] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [parsing, setParsing] = useState(false);
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<{ characterId: string; characterName: string; spellCount: number; customCount: number } | null>(null);
  const parseInFlight = useRef(false);

  useEffect(() => {
    if (!session) void createImportSession();
  }, [session]);
  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => { window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); };
  }, []);

  const orderedFiles = useMemo(() => session ? session.fileOrder.map((id) => files.find((file) => file.id === id)).filter((file): file is NonNullable<typeof file> => Boolean(file)) : [], [files, session]);
  const draft = session?.mergedDraft ?? null;
  const proficiencyBonus = draft?.proficiencyBonus ?? { value: 2, include: false, needsReview: true, confidence: null, sourceNames: [], conflicts: [] };
  const biography = draft?.biography ?? { value: "", include: false, needsReview: true, confidence: null, sourceNames: [], conflicts: [] };
  const importedSpells = draft?.importedSpells ?? { value: [], include: false, needsReview: true, confidence: null, sourceNames: [], conflicts: [] };
  const spellReview = useMemo(() => reviewImportedSpells(draft?.rawSpellCount ?? 0, importedSpells.value), [draft?.rawSpellCount, importedSpells.value]);
  const onlineProvider = getOnlineImportProvider();

  const chooseFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!session) return;
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) return;
    try {
      await addImportFiles(session.id, selected);
      setFailure(null);
      setStatus(`${selected.length} ${selected.length === 1 ? "file" : "files"} added to this character import.`);
      event.target.value = "";
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add files");
    }
  };

  const chooseBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus(`Reading ${file.name}...`);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const backup = await validateVaultBackup(parsed);
      if (backup.payload.characters.length !== 1) throw new Error("This backup contains more than one character. Use Vault Tools to restore full-vault backups.");
      const importedBackup = await cloneCharacterBackupForImport(backup);
      const importedCharacter = importedBackup.payload.characters[0];
      const characterName = importedCharacter.name;
      await restoreVaultBackup(importedBackup, "merge-skip");
      await activateCharacter(importedCharacter.id);
      queueCharacterAnnouncement(`${characterName} imported.`);
      setStatus(`Imported ${characterName} from ${file.name}. Character sheet, spells, notes, layout, and inventory were restored locally.`);
      event.target.value = "";
      window.location.hash = `sheet/${importedCharacter.id}`;
    } catch (error) {
      setStatus(error instanceof SyntaxError ? "That file is not valid JSON. Choose a Character Vault .json export." : error instanceof Error ? error.message : "Could not import character backup");
    }
  };

  const setImportMode = async (nextMode: ImportMode) => {
    if (!session) return;
    await updateImportSession({ ...session, mode: nextMode });
    setFailure(null);
  };

  const parseBatch = async () => {
    if (!session || !orderedFiles.length || parseInFlight.current) return;
    const provider = getImportProvider(session.mode);
    if (!provider.available) return setStatus(provider.unavailableReason);
    if (session.mode === "online" && !window.confirm("Online AI import will send every selected file to the configured external OCR service. This is optional; Local import keeps files on this device. Send these files now?")) return;
    parseInFlight.current = true;
    setParsing(true);
    setFailure(null);
    setStatus(`Starting ${provider.label}...`);
    try {
      await updateImportSession({ ...session, status: "parsing" });
      const providerResults = await provider.parse(orderedFiles, setStatus);
      const parseResults: ImportParseResult[] = providerResults.map((result) => {
        const sourceName = orderedFiles.find((file) => file.id === result.fileId)?.name ?? "Imported file";
        try {
          return { fileId: result.fileId, sourceName, rawText: result.rawText, confidence: result.confidence, draft: applyProviderConfidence(extractCharacterText(result.rawText, sourceName, result.spellData), result.confidence) };
        } catch (error) {
          throw asImportParserError(error, { stage: "normalizing-character", fileName: sourceName, fileId: result.fileId, pageCount: result.pageCount ?? undefined });
        }
      });
      let merged: ReturnType<typeof mergeImportResults>;
      try {
        merged = mergeImportResults(parseResults);
      } catch (error) {
        throw asImportParserError(error, { stage: "creating-preview", fileName: orderedFiles[0]?.name ?? "Selected files" });
      }
      await db.transaction("rw", db.importSessions, db.importSessionFiles, async () => {
        for (const result of providerResults) await db.importSessionFiles.update(result.fileId, { pageCount: result.pageCount });
        await updateImportSession({ ...session, status: "review", parseResults, ...merged });
      });
      setStatus(merged.conflicts.length ? `Parsing complete with ${merged.conflicts.length} conflicts needing review.` : "Parsing complete. Review every selected field before saving.");
    } catch (error) {
      await updateImportSession({ ...session, status: session.mergedDraft ? "review" : "selecting" });
      setFailure(describeImportFailure(error, {
        fileName: orderedFiles[0]?.name,
        buildId: BUILD_ID,
        browser: typeof navigator === "undefined" ? "Unknown browser" : navigator.userAgent,
      }));
      setStatus("Import stopped safely. Your selected files and any previous review are still available.");
    } finally {
      parseInFlight.current = false;
      setParsing(false);
    }
  };

  const useLocalFallback = async () => {
    await setImportMode("local");
    setStatus("Local import selected. Your files are ready to retry without uploading.");
  };

  const removeFailedFile = async () => {
    if (!session || !failure) return;
    const fileId = failure.fileId ?? orderedFiles.find((file) => file.name === failure.fileName)?.id;
    if (!fileId) return;
    await removeImportFile(session.id, fileId);
    setFailure(null);
    setStatus(`${failure.fileName} removed. Other selected files remain in this import.`);
  };

  const update = async <Key extends keyof CharacterImportDraft>(key: Key, value: CharacterImportDraft[Key]) => {
    if (!session?.mergedDraft) return;
    await updateImportSession({ ...session, mergedDraft: { ...session.mergedDraft, [key]: value } });
  };

  const save = async () => {
    if (!draft || !session) return;
    if (mode === "merge" && !targetId) return setStatus("Choose a character to merge into.");
    if (mode === "merge" && !window.confirm("Merge the selected reviewed fields into this character? Existing values are changed only for checked fields.")) return;
    setStatus("Saving reviewed fields locally...");
    try {
      const result = await saveCharacterImport(draft, mode, targetId, orderedFiles);
      await activateCharacter(result.characterId);
      const characterName = draft.name.value.trim() || "Imported character";
      queueCharacterAnnouncement(`${characterName} imported with ${result.spells.imported + result.spells.skippedExisting} spells.`);
      await discardImportSession(session.id);
      setSaveSuccess({ characterId: result.characterId, characterName, spellCount: result.spells.imported + result.spells.skippedExisting, customCount: result.spells.custom });
      setStatus(result.spells.detected
        ? `${characterName} imported with ${result.spells.imported + result.spells.skippedExisting} spells.`
        : `${characterName} imported, but no structured spells were detected in the selected files.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save import");
    }
  };

  const startFresh = async () => {
    if (!session || (session.fileOrder.length && !window.confirm("Discard this import session and its selected files?"))) return;
    await discardImportSession(session.id);
    await createImportSession();
    setStatus("Started a new import session.");
  };

  if (!session) return <section className="page"><div className="loading-state">Opening import session...</div></section>;

  return <section className="page import-page">
    <PageHeader eyebrow="Character tools" title="Import one character from several sources" description="Combine PDFs, scans, photos, and screenshots into one reviewable character draft. Your in-progress session stays on this device." actions={<button className="secondary-button" onClick={() => void startFresh()} type="button">New import session</button>} />

    {saveSuccess && <article className="panel import-success-panel" role="status">
      <span className="card-label">Import complete</span>
      <h2>{saveSuccess.characterName} imported with {saveSuccess.spellCount} spells.</h2>
      <p>{saveSuccess.customCount ? `${saveSuccess.customCount} unmatched spells were retained as local imported drafts.` : "All imported spells matched existing catalog definitions."}</p>
      <div className="header-action-group"><a className="primary-button button-link" href={`#sheet/${saveSuccess.characterId}`}>Open Character</a><a className="secondary-button button-link" href={`#spellbook/${saveSuccess.characterId}`} onClick={() => window.localStorage.setItem(`vault:spellbook:${saveSuccess.characterId}`, JSON.stringify({ page: "owned", classKey: "", level: 0 }))}>Open Spellbook</a><a className="secondary-button button-link" href={`#spellbook/${saveSuccess.characterId}`} onClick={() => window.localStorage.setItem(`vault:spellbook:${saveSuccess.characterId}`, JSON.stringify({ page: "owned", classKey: "", level: 0 }))}>Review Imported Spells</a></div>
    </article>}

    <article className="panel import-files-panel">
      <div className="form-section-heading">
        <div><span className="card-label">Character transfer</span><h2>Import an exported character backup</h2><p>Use this for a Character Vault .json file shared from another device. It restores the character locally without uploading anything.</p></div>
        <label className="file-button primary-button">Choose character backup<input accept="application/json,text/plain,.json" onChange={(event) => void chooseBackupFile(event)} type="file" /></label>
      </div>
    </article>

    <article className="panel import-mode-panel">
      <div><span className="card-label">Import method</span><h2>Choose how files are read</h2><p>After parsing, both methods use the same conflict review and manual correction flow.</p></div>
      <div className="import-mode-options">
        <label className="import-mode-card"><input checked={session.mode === "local"} onChange={() => void setImportMode("local")} type="radio" /><span><strong>Local import (private, offline)</strong><small>Files stay on this device. Best for clear sheets and typed PDFs.</small></span></label>
        <label className={onlineProvider.available ? "import-mode-card" : "import-mode-card disabled"}><input checked={session.mode === "online"} disabled={!onlineProvider.available} onChange={() => void setImportMode("online")} type="radio" /><span><strong>Online AI import (better accuracy, requires internet)</strong><small>{onlineProvider.available ? "Useful for messy scans and photos. Files are sent only after confirmation." : !online ? "Unavailable because this device is offline." : onlineProvider.unavailableReason}</small></span></label>
      </div>
    </article>

    <article className="panel import-files-panel">
      <div className="form-section-heading"><div><span className="card-label">Step 1</span><h2>Build this character's source batch</h2><p>All selected files belong to one character import. Their order is preserved and can be changed before parsing.</p></div><label className="file-button primary-button">Add PDFs or images<input accept="application/pdf,image/*" multiple onChange={(event) => void chooseFiles(event)} type="file" /></label></div>
      <div className="import-file-list">
        {orderedFiles.length ? orderedFiles.map((file, index) => <article className="import-file-row" key={file.id}>
          <span className="import-file-order">{index + 1}</span>
          <span className="import-file-copy"><strong>{file.name}</strong><small>{fileTypeLabel(file.type, file.name)} · {file.pageCount ? `${file.pageCount} ${file.pageCount === 1 ? "page/image" : "pages"}` : "page count available after parsing"} · {(file.size / 1024 / 1024).toFixed(1)} MB</small></span>
          <span className="import-file-actions"><button aria-label={`Move ${file.name} up`} className="secondary-button compact" disabled={index === 0 || parsing} onClick={() => void reorderImportFile(session.id, file.id, -1)} type="button">↑</button><button aria-label={`Move ${file.name} down`} className="secondary-button compact" disabled={index === orderedFiles.length - 1 || parsing} onClick={() => void reorderImportFile(session.id, file.id, 1)} type="button">↓</button><button className="text-button danger" disabled={parsing} onClick={() => void removeImportFile(session.id, file.id)} type="button">Remove</button></span>
        </article>) : <div className="spell-empty compact-empty"><strong>No source files selected</strong><span>Add one or several PDFs, photos, scans, or screenshots.</span></div>}
      </div>
      {failure && <section className="import-error-panel" role="alert">
        <span className="card-label">Import stopped safely</span>
        <h3>{failure.primaryMessage}</h3>
        <p>The problem occurred while <strong>{failure.stageLabel.toLowerCase()}</strong>. The file remains selected, and no character was created or partly saved.</p>
        <div className="import-error-actions">
          <button className="primary-button" disabled={parsing} onClick={() => void parseBatch()} type="button">Retry import</button>
          {session.mode !== "local" && <button className="secondary-button" onClick={() => void useLocalFallback()} type="button">Use Local Import fallback</button>}
          <button className="text-button danger" onClick={() => void removeFailedFile()} type="button">Remove this file</button>
        </div>
        <details><summary>View technical details</summary><pre>{failure.technicalDetails}</pre></details>
      </section>}
      <button className="primary-button import-parse-button" disabled={!orderedFiles.length || parsing} onClick={() => void parseBatch()} type="button">{parsing ? "Parsing files..." : session.status === "review" ? "Re-parse selected files" : `Parse ${orderedFiles.length || ""} ${orderedFiles.length === 1 ? "file" : "files"}`}</button>
    </article>

    {draft && <>
      <article className="panel import-spell-summary">
        <div className="form-section-heading"><div><span className="card-label">Spell import</span><h2>{spellReview.uniqueCount ? `${spellReview.uniqueCount} unique spells ready` : "No structured spells detected"}</h2><p>{spellReview.uniqueCount ? "Spells will be written directly to this character’s My Spells collection when you save." : "The character can still be saved, but its spellbook will be empty unless spell fields are present."}</p></div>{spellReview.uniqueCount > 0 && <label className="touch-toggle"><input checked={importedSpells.include} onChange={(event) => void update("importedSpells", { ...importedSpells, include: event.target.checked })} type="checkbox" /><span>Import detected spells</span></label>}</div>
        <div className="import-spell-metrics"><span><strong>{spellReview.rawCount}</strong>Raw entries</span><span><strong>{spellReview.uniqueCount}</strong>After deduplication</span><span><strong>{spellReview.preparedCount}</strong>Prepared</span><span><strong>{spellReview.alwaysPreparedCount}</strong>Always prepared</span><span><strong>{spellReview.customCount}</strong>Custom / unmatched</span></div>
        {spellReview.variantCount > 0 && <p className="inline-message">{spellReview.variantCount} mechanically distinct duplicate {spellReview.variantCount === 1 ? "variant was" : "variants were"} kept separately. Equivalent duplicates were merged.</p>}
        {spellReview.unknownLevelCount > 0 && <p className="inline-message error-message">{spellReview.unknownLevelCount} {spellReview.unknownLevelCount === 1 ? "spell has" : "spells have"} no recognized level header and need review.</p>}
        {spellReview.uniqueCount > 0 && <details><summary>Review detected spells</summary><div className="imported-spell-list">{importedSpells.value.map((spell) => <span key={`${spell.index}-${spell.variantKey}`}><strong>{spell.name}</strong><small>{spell.level === null ? "Level unknown" : spell.level === 0 ? "Cantrip" : `Level ${spell.level}`}{spell.alwaysPrepared ? " · Always prepared" : spell.prepared ? " · Prepared" : ""}{spell.ritual ? " · Ritual" : ""}{spell.source ? ` · ${spell.source}` : ""}</small></span>)}</div></details>}
        {spellReview.uniqueCount > 0 && <p>Spellcasting: {draft.spellcastingAbility?.value?.toUpperCase() || "ability unavailable"} · Save DC {draft.spellSaveDc?.include ? draft.spellSaveDc.value : "unavailable"} · Attack {draft.spellAttackBonus?.include ? `${draft.spellAttackBonus.value >= 0 ? "+" : ""}${draft.spellAttackBonus.value}` : "unavailable"} · {draft.spellcastingClass?.value || "class unavailable"}</p>}
      </article>
      <article className="panel import-destination">
        <div><span className="card-label">Step 2</span><h2>Choose destination</h2><p>Merge never changes an unchecked field.</p></div>
        <div className="destination-controls"><label className="touch-toggle"><input checked={mode === "create"} onChange={() => setMode("create")} type="radio" /><span>Create new character</span></label><label className="touch-toggle"><input checked={mode === "merge"} onChange={() => setMode("merge")} type="radio" /><span>Merge into existing character</span></label>{mode === "merge" && <select onChange={(event) => setTargetId(event.target.value)} value={targetId}><option value="">Choose character...</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select>}</div>
      </article>

      <article className="panel import-review">
        <div className="form-section-heading"><div><span className="card-label">Step 3</span><h2>Review merged character draft</h2><p>Sources and confidence appear under extracted fields. Conflicts are never silently overwritten.</p></div><button className="primary-button" onClick={() => void save()} type="button">Save reviewed import</button></div>
        {session.conflicts.length > 0 && <section className="import-conflicts"><h3>{session.conflicts.length} conflicts need confirmation</h3>{session.conflicts.map((conflict) => <div key={conflict.fieldPath}><strong>{conflict.label}</strong>{conflict.sources.map((source) => <span key={`${conflict.fieldPath}-${source.sourceName}`}><small>{source.sourceName}</small>{source.value}</span>)}</div>)}</section>}
        <div className="review-grid">
          <ReviewField field={draft.name} label="Character name" onChange={(value) => void update("name", value as ImportField<string>)} />
          <ReviewField field={draft.playerName} label="Player name" onChange={(value) => void update("playerName", value as ImportField<string>)} />
          <ReviewField field={draft.level} label="Level" onChange={(value) => void update("level", value as ImportField<number>)} type="number" />
          <ReviewField field={draft.characterClass} label="Class / classes" onChange={(value) => void update("characterClass", value as ImportField<string>)} />
          <ReviewField field={draft.ancestry} label="Species / ancestry" onChange={(value) => void update("ancestry", value as ImportField<string>)} />
          <ReviewField field={draft.background} label="Background" onChange={(value) => void update("background", value as ImportField<string>)} />
          <ReviewField field={biography} label="Biography" onChange={(value) => void update("biography", value as ImportField<string>)} />
          <ReviewField field={draft.currentHp} label="Current HP" onChange={(value) => void update("currentHp", value as ImportField<number>)} type="number" />
          <ReviewField field={draft.maxHp} label="Max HP" onChange={(value) => void update("maxHp", value as ImportField<number>)} type="number" />
          <ReviewField field={draft.armorClass} label="Armor Class" onChange={(value) => void update("armorClass", value as ImportField<number>)} type="number" />
          <ReviewField field={draft.initiative} label="Initiative" onChange={(value) => void update("initiative", value as ImportField<number>)} type="number" />
          <ReviewField field={draft.speed} label="Speed" onChange={(value) => void update("speed", value as ImportField<number>)} type="number" />
          <ReviewField field={proficiencyBonus} label="Proficiency Bonus" onChange={(value) => void update("proficiencyBonus", value as ImportField<number>)} type="number" />
        </div>
        <h3 className="review-subheading">Ability Scores</h3>
        <div className="ability-grid">{abilityIds.map((ability) => <ReviewField field={draft.abilityScores[ability]} key={ability} label={abilityLabels[ability]} onChange={(value) => void update("abilityScores", { ...draft.abilityScores, [ability]: value as ImportField<number> })} type="number" />)}</div>
        <div className="import-check-columns"><section><h3>Skills</h3>{skillIds.map((skill) => <label className="proficiency-row" key={skill}><input checked={draft.skills[skill].include} onChange={(event) => void update("skills", { ...draft.skills, [skill]: { ...draft.skills[skill], include: event.target.checked, value: event.target.checked } })} type="checkbox" /><span>{skill}</span>{draft.skills[skill].needsReview && <small>Needs Review</small>}</label>)}</section><section><h3>Saving Throws</h3>{abilityIds.map((ability) => <label className="proficiency-row" key={ability}><input checked={draft.savingThrows[ability].include} onChange={(event) => void update("savingThrows", { ...draft.savingThrows, [ability]: { ...draft.savingThrows[ability], include: event.target.checked, value: event.target.checked } })} type="checkbox" /><span>{abilityLabels[ability]}</span>{draft.savingThrows[ability].needsReview && <small>Needs Review</small>}</label>)}</section></div>
        {(["inventory", "features"] as const).map((key) => <label className={draft[key].needsReview ? "form-field full-width needs-review" : "form-field full-width"} key={key}><span><input checked={draft[key].include} onChange={(event) => void update(key, { ...draft[key], include: event.target.checked })} type="checkbox" /> {key === "inventory" ? "Inventory / items" : "Features / traits"} {draft[key].needsReview && <small>Needs Review</small>}</span><SourceInfo field={draft[key]} /><textarea disabled={!draft[key].include} onChange={(event) => void update(key, { ...draft[key], value: event.target.value.split("\n"), needsReview: false })} rows={8} value={draft[key].value.join("\n")} /></label>)}
        <label className={draft.spellsAndNotes.needsReview ? "form-field full-width needs-review" : "form-field full-width"}><span><input checked={draft.spellsAndNotes.include} onChange={(event) => void update("spellsAndNotes", { ...draft.spellsAndNotes, include: event.target.checked })} type="checkbox" /> Spells / notes {draft.spellsAndNotes.needsReview && <small>Needs Review</small>}</span><SourceInfo field={draft.spellsAndNotes} /><textarea disabled={!draft.spellsAndNotes.include} onChange={(event) => void update("spellsAndNotes", { ...draft.spellsAndNotes, value: event.target.value, needsReview: false })} rows={10} value={draft.spellsAndNotes.value} /></label>
        <details className="raw-import-text"><summary>View extracted text from all files</summary><pre>{draft.rawText}</pre></details>
      </article>
    </>}
    {status && <p className="panel inline-message tool-status" role="status">{status}</p>}
  </section>;
}
