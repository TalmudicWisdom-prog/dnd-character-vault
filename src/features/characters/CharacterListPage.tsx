import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import type { Character } from "../../domain/models";
import { ACTIVE_CHARACTER_CHANGED_EVENT, activateCharacter, activeCharacterId, queueCharacterAnnouncement, rankAvailableCharacters } from "../../app/activeCharacter";
import { createCharacterBackup, downloadBackup } from "../../storage/backups";
import { deleteCharacter, duplicateCharacter, setCharacterArchived, setCharacterFavorite } from "../../storage/characters";
import { db } from "../../storage/database";
import { CharacterAvatar } from "./CharacterAvatar";

type Filter = "active" | "recent" | "archived";

function openedLabel(character: Character) {
  const timestamp = character.lastOpenedAt ?? character.updatedAt;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return `Last opened ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)}`;
}

function CharacterCard({ active, character, onStatus }: { active: boolean; character: Character; onStatus: (message: string) => void }) {
  const metadata = [
    character.characterClass && `Level ${character.level} ${character.characterClass}`,
    character.ancestry,
    character.campaign,
  ].filter(Boolean);

  const open = async () => {
    await activateCharacter(character.id);
    window.location.hash = `sheet/${character.id}`;
  };

  const duplicate = async () => {
    onStatus(`Duplicating ${character.name}...`);
    const copy = await duplicateCharacter(character.id);
    await activateCharacter(copy.id);
    queueCharacterAnnouncement(`${copy.name} created.`);
    onStatus(`${copy.name} is ready.`);
    window.location.hash = `sheet/${copy.id}`;
  };

  const exportCharacter = async () => {
    onStatus(`Preparing ${character.name}...`);
    const backup = await createCharacterBackup(character.id);
    const result = await downloadBackup(backup, "character");
    onStatus(`${character.name} export ${result.deliveryMethod === "shared" ? "shared" : "ready"}.`);
  };

  const remove = async () => {
    if (!window.confirm(`Permanently delete ${character.name} and all of this character's sheet, spells, inventory, notes, and module data? This cannot be undone.`)) return;
    await deleteCharacter(character.id);
    onStatus(`${character.name} was permanently deleted.`);
  };

  const toggleArchive = async () => {
    await setCharacterArchived(character.id, !character.archivedAt);
    onStatus(character.archivedAt ? `${character.name} was restored.` : `${character.name} was archived.`);
  };

  return (
    <article className={`character-card${active ? " active-character" : ""}${character.archivedAt ? " archived-character" : ""}`}>
      <div className="character-card-main">
        <CharacterAvatar name={character.name} portraitDataUrl={character.portraitDataUrl} size="large" />
        <div className="character-card-copy">
          <span className="character-title-row">
            <strong>{character.name}</strong>
            {active && <span className="status-badge">Active</span>}
            {character.archivedAt && <span className="status-badge warning">Archived</span>}
          </span>
          <span>{metadata.join(" · ") || "Character details not set"}</span>
          <small>{character.summary || openedLabel(character)}</small>
          {character.summary && <small>{openedLabel(character)}</small>}
        </div>
      </div>
      <div className="character-card-controls">
        <button aria-label={character.favorite ? `Remove ${character.name} from favorites` : `Favorite ${character.name}`} className={character.favorite ? "favorite-button selected" : "favorite-button"} onClick={() => void setCharacterFavorite(character.id, !character.favorite)} type="button">★</button>
        {character.archivedAt
          ? <button className="primary-button compact" onClick={() => void toggleArchive()} type="button">Restore</button>
          : <button className="primary-button compact" onClick={() => void open()} type="button">Open</button>}
        <details className="character-action-menu">
          <summary aria-label={`More actions for ${character.name}`}>•••</summary>
          <div className="character-action-menu-popover">
            {!character.archivedAt && <><a href={`#character/${character.id}`}>Edit profile</a><a href={`#spellbook/${character.id}`}>Open spellbook</a></>}
            <button onClick={() => void duplicate()} type="button">Duplicate full character</button>
            <button onClick={() => void exportCharacter()} type="button">Export character</button>
            <button onClick={() => void toggleArchive()} type="button">{character.archivedAt ? "Restore" : "Archive"}</button>
            <button className="danger" onClick={() => void remove()} type="button">Delete permanently</button>
          </div>
        </details>
      </div>
    </article>
  );
}

export function CharacterListPage() {
  const characters = useLiveQuery(() => db.characters.toArray(), []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [activeId, setActiveId] = useState(activeCharacterId);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const sync = () => setActiveId(activeCharacterId());
    window.addEventListener(ACTIVE_CHARACTER_CHANGED_EVENT, sync);
    return () => window.removeEventListener(ACTIVE_CHARACTER_CHANGED_EVENT, sync);
  }, []);

  const active = useMemo(() => rankAvailableCharacters(characters ?? []), [characters]);
  const archived = useMemo(() => (characters ?? []).filter((character) => character.archivedAt).sort((left, right) => (right.archivedAt ?? "").localeCompare(left.archivedAt ?? "")), [characters]);
  const recent = active.slice(0, 5);

  const visibleCharacters = useMemo(() => {
    const source = filter === "archived" ? archived : filter === "recent" ? recent : active;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return source;
    return source.filter((character) => [character.name, character.summary, character.playerName, character.campaign, character.ancestry, character.characterClass]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
  }, [active, archived, filter, query, recent]);

  const filterLabel = filter === "archived" ? "Archived characters" : filter === "recent" ? "Recently opened" : "Active characters";

  return (
    <section className="page">
      <PageHeader eyebrow="Your adventuring party" title="Character Vault" description="Open a hero, switch campaigns, or manage every locally saved character." actions={<div className="character-create-actions"><a className="primary-button button-link" href="#character/new"><span>New Character</span><small>Guided creation</small></a><a className="secondary-button button-link import-character-button" href="#import"><span>Import Character</span><small>PDF, photos, or backup</small></a></div>} />

      {status && <p aria-live="polite" className="panel inline-message tool-status" role="status">{status}</p>}

      <div className="summary-grid">
        <button className={filter === "active" ? "summary-card accent selected-card" : "summary-card selectable-card"} onClick={() => setFilter("active")}><span className="card-label">Active characters</span><strong>{active.length}</strong><small>Available in the quick switcher</small></button>
        <button className={filter === "recent" ? "summary-card accent selected-card" : "summary-card selectable-card"} onClick={() => setFilter("recent")}><span className="card-label">Recently opened</span><strong>{recent.length}</strong><small>Your latest five heroes</small></button>
        <button className={filter === "archived" ? "summary-card accent selected-card" : "summary-card selectable-card"} onClick={() => setFilter("archived")}><span className="card-label">Archived</span><strong>{archived.length}</strong><small>Stored outside the switcher</small></button>
      </div>

      <div className="section-heading">
        <div><h2>{filterLabel}</h2><p>{visibleCharacters.length} {visibleCharacters.length === 1 ? "character" : "characters"} shown</p></div>
        <label className="search-field"><span className="sr-only">Search characters</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search name, class, or campaign" type="search" value={query} /></label>
      </div>

      {visibleCharacters.length ? (
        <div className="character-list">{visibleCharacters.map((character) => <CharacterCard active={character.id === activeId && !character.archivedAt} character={character} key={character.id} onStatus={setStatus} />)}</div>
      ) : (
        <div className="empty-state"><div className="empty-emblem" aria-hidden="true">V</div><h2>{query ? "No characters found" : filter === "archived" ? "No archived characters" : "Your vault is ready"}</h2><p>{query ? "Try another name, campaign, ancestry, or class." : "Create your first character manually or import one from documents and photos."}</p>{!query && filter !== "archived" && <div className="empty-create-actions"><a className="primary-button button-link" href="#character/new">Create manually</a><a className="secondary-button button-link" href="#import">Import from PDF / Photos</a></div>}</div>
      )}
    </section>
  );
}
