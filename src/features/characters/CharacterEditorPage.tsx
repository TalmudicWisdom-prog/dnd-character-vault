import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import type { CharacterDraft } from "../../domain/models";
import {
  createCharacter,
  deleteCharacter,
  duplicateCharacter,
  setCharacterArchived,
  updateCharacter,
} from "../../storage/characters";
import { db } from "../../storage/database";

const emptyDraft: CharacterDraft = {
  name: "",
  summary: "",
  playerName: "",
  campaign: "",
  ancestry: "",
  characterClass: "",
  level: 1,
};

type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

export function CharacterEditorPage({ characterId }: { characterId: string }) {
  const isNew = characterId === "new";
  const character = useLiveQuery(
    async () => isNew ? undefined : (await db.characters.get(characterId)) ?? null,
    [characterId, isNew],
  );
  const [draft, setDraft] = useState<CharacterDraft>(emptyDraft);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [initializedId, setInitializedId] = useState<string | null>(null);
  const editVersion = useRef(0);

  useEffect(() => {
    if (isNew) {
      if (initializedId !== "new") {
        setDraft(emptyDraft);
        setInitializedId("new");
      }
      return;
    }

    if (character && initializedId !== character.id) {
      setDraft({
        name: character.name,
        summary: character.summary,
        playerName: character.playerName,
        campaign: character.campaign,
        ancestry: character.ancestry,
        characterClass: character.characterClass,
        level: character.level,
      });
      setInitializedId(character.id);
      setStatus("saved");
    }
  }, [character, initializedId, isNew]);

  useEffect(() => {
    if (isNew || status !== "unsaved" || !draft.name.trim()) return;

    const timer = window.setTimeout(async () => {
      const savingVersion = editVersion.current;
      setStatus("saving");
      try {
        await updateCharacter(characterId, { ...draft, name: draft.name.trim() });
        setStatus(editVersion.current === savingVersion ? "saved" : "unsaved");
      } catch {
        setStatus("error");
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [characterId, draft, isNew, status]);

  const updateDraft = <Key extends keyof CharacterDraft>(key: Key, value: CharacterDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (!isNew) {
      editVersion.current += 1;
      setStatus("unsaved");
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;

    setStatus("saving");
    try {
      const created = await createCharacter({ ...draft, name: draft.name.trim() });
      window.location.hash = `character/${created.id}`;
    } catch {
      setStatus("error");
    }
  };

  const archive = async () => {
    if (!character) return;
    await setCharacterArchived(character.id, !character.archivedAt);
  };

  const duplicate = async () => {
    if (!character) return;
    const copy = await duplicateCharacter(character.id);
    window.location.hash = `character/${copy.id}`;
  };

  const remove = async () => {
    if (!character || !window.confirm(`Permanently delete ${character.name}? This cannot be undone.`)) return;
    await deleteCharacter(character.id);
    window.location.hash = "characters";
  };

  if (!isNew && character === undefined) {
    return <section className="page"><div className="loading-state">Opening character...</div></section>;
  }

  if (!isNew && character === null) {
    return (
      <section className="page">
        <PageHeader eyebrow="Not found" title="Character unavailable" description="This character may have been deleted." />
        <a className="secondary-button button-link" href="#characters">Return to characters</a>
      </section>
    );
  }

  const statusLabel = isNew
    ? "Not saved yet"
    : status === "saving"
      ? "Saving locally..."
      : status === "unsaved"
        ? "Unsaved changes"
        : status === "error"
          ? "Could not save"
          : "Saved locally";

  return (
    <section className="page editor-page">
      <PageHeader
        eyebrow={isNew ? "A new story begins" : character?.archivedAt ? "Archived character" : "Character profile"}
        title={isNew ? "New character" : character?.name ?? "Character"}
        description={isNew ? "Start with the details that make this character yours." : "Identity and campaign details save automatically on this device."}
        actions={<a className="secondary-button button-link" href="#characters">Back to characters</a>}
      />

      <form className="editor-layout" onSubmit={(event) => void create(event)}>
        <div className="editor-main">
          <article className="panel form-section">
            <div className="form-section-heading">
              <div><span className="card-label">Essentials</span><h2>Who are they?</h2></div>
              <span className={status === "error" ? "save-state error" : "save-state"}>{statusLabel}</span>
            </div>
            <div className="form-grid">
              <label className="form-field full-width">
                <span>Character name</span>
                <input
                  autoFocus
                  maxLength={100}
                  onChange={(event) => updateDraft("name", event.target.value)}
                  placeholder="Enter a name"
                  required
                  value={draft.name}
                />
              </label>
              <label className="form-field">
                <span>Player name</span>
                <input maxLength={100} onChange={(event) => updateDraft("playerName", event.target.value)} placeholder="Optional" value={draft.playerName} />
              </label>
              <label className="form-field">
                <span>Campaign</span>
                <input maxLength={100} onChange={(event) => updateDraft("campaign", event.target.value)} placeholder="Optional" value={draft.campaign} />
              </label>
              <label className="form-field">
                <span>Ancestry</span>
                <input maxLength={100} onChange={(event) => updateDraft("ancestry", event.target.value)} placeholder="Optional" value={draft.ancestry} />
              </label>
              <label className="form-field">
                <span>Class</span>
                <input maxLength={100} onChange={(event) => updateDraft("characterClass", event.target.value)} placeholder="Optional" value={draft.characterClass} />
              </label>
              <label className="form-field">
                <span>Level</span>
                <input max={20} min={1} onChange={(event) => updateDraft("level", Number(event.target.value))} type="number" value={draft.level} />
              </label>
            </div>
          </article>

          <article className="panel form-section">
            <div className="form-section-heading"><div><span className="card-label">At a glance</span><h2>Character summary</h2></div></div>
            <label className="form-field full-width">
              <span>Summary / backstory</span>
              <textarea
                maxLength={20000}
                onChange={(event) => updateDraft("summary", event.target.value)}
                placeholder="Backstory, personality, goals, important relationships, campaign history..."
                rows={10}
                value={draft.summary}
              />
              <small>Long summaries and full backstories are welcome.</small>
            </label>
          </article>
        </div>

        <aside className="editor-side">
          {isNew ? (
            <article className="panel action-panel">
              <span className="card-label">Ready?</span>
              <h2>Create this character</h2>
              <p>The character will be stored locally and can be edited at any time.</p>
              <button className="primary-button" disabled={!draft.name.trim() || status === "saving"} type="submit">Create character</button>
            </article>
          ) : (
            <article className="panel action-panel">
              <span className="card-label">Play</span>
              <h2>Character sheet</h2>
              <p>Open HP controls, abilities, proficiencies, and notes.</p>
              <a className="primary-button button-link" href={`#sheet/${characterId}`}>Open character sheet</a>
            </article>
          )}
          {!isNew && (
            <article className="panel action-panel">
              <span className="card-label">Vault actions</span>
              <h2>Manage character</h2>
              <button className="secondary-button" onClick={() => void duplicate()} type="button">Duplicate character</button>
              <button className="secondary-button" onClick={() => void archive()} type="button">{character?.archivedAt ? "Restore character" : "Archive character"}</button>
              <button className="secondary-button danger-button" onClick={() => void remove()} type="button">Delete permanently</button>
            </article>
          )}
        </aside>
      </form>
    </section>
  );
}
