import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import type { Character } from "../../domain/models";
import { deleteCharacter, duplicateCharacter, setCharacterArchived } from "../../storage/characters";
import { db } from "../../storage/database";

type Filter = "active" | "recent" | "archived";

function CharacterCard({ character }: { character: Character }) {
  const archiveLabel = character.archivedAt ? "Restore" : "Archive";
  const metadata = [
    character.characterClass && `Level ${character.level} ${character.characterClass}`,
    character.ancestry,
    character.campaign,
  ].filter(Boolean);

  const remove = async () => {
    if (window.confirm(`Permanently delete ${character.name}? This cannot be undone.`)) {
      await deleteCharacter(character.id);
    }
  };

  return (
    <article className="character-card">
      <a className="character-card-main" href={`#character/${character.id}`}>
        <span className="character-monogram" aria-hidden="true">{character.name.slice(0, 1).toUpperCase()}</span>
        <span className="character-card-copy">
          <span className="character-title-row">
            <strong>{character.name}</strong>
            {character.archivedAt && <span className="status-badge warning">Archived</span>}
          </span>
          <span>{metadata.join(" · ") || "Character details not set"}</span>
          <small>{character.summary || "No summary yet."}</small>
        </span>
      </a>
      <div className="character-actions">
        <a className="text-button" href={`#sheet/${character.id}`}>Sheet</a>
        <a className="text-button" href={`#spellbook/${character.id}`}>Spells</a>
        <a className="text-button" href={`#character/${character.id}`}>Edit</a>
        <button className="text-button" onClick={() => void duplicateCharacter(character.id)}>Duplicate</button>
        <button className="text-button" onClick={() => void setCharacterArchived(character.id, !character.archivedAt)}>
          {archiveLabel}
        </button>
        <button className="text-button danger" onClick={() => void remove()}>Delete</button>
      </div>
    </article>
  );
}

export function CharacterListPage() {
  const characters = useLiveQuery(() => db.characters.orderBy("updatedAt").reverse().toArray(), []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");

  const active = useMemo(() => characters?.filter((character) => !character.archivedAt) ?? [], [characters]);
  const archived = useMemo(() => characters?.filter((character) => character.archivedAt) ?? [], [characters]);
  const recent = active.slice(0, 5);

  const visibleCharacters = useMemo(() => {
    const source = filter === "archived" ? archived : filter === "recent" ? recent : active;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return source;

    return source.filter((character) =>
      [
        character.name,
        character.summary,
        character.playerName,
        character.campaign,
        character.ancestry,
        character.characterClass,
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [active, archived, filter, query, recent]);

  const filterLabel = filter === "archived" ? "Archived characters" : filter === "recent" ? "Recently edited" : "Active characters";

  return (
    <section className="page">
      <PageHeader
        eyebrow="Your adventuring party"
        title="Characters"
        description="Create a character manually or import one from PDFs and photos."
        actions={<div className="character-create-actions"><a className="primary-button button-link" href="#character/new"><span>New Character</span><small>Manual entry</small></a><a className="secondary-button button-link import-character-button" href="#import"><span>Import Character</span><small>From PDF / Photos</small></a></div>}
      />

      <div className="summary-grid">
        <button className={filter === "active" ? "summary-card accent selected-card" : "summary-card selectable-card"} onClick={() => setFilter("active")}>
          <span className="card-label">Active characters</span>
          <strong>{active.length}</strong>
          <small>Ready for the next session</small>
        </button>
        <button className={filter === "recent" ? "summary-card accent selected-card" : "summary-card selectable-card"} onClick={() => setFilter("recent")}>
          <span className="card-label">Recently edited</span>
          <strong>{recent.length}</strong>
          <small>Your latest five characters</small>
        </button>
        <button className={filter === "archived" ? "summary-card accent selected-card" : "summary-card selectable-card"} onClick={() => setFilter("archived")}>
          <span className="card-label">Archived</span>
          <strong>{archived.length}</strong>
          <small>Stored out of the way</small>
        </button>
      </div>

      <div className="section-heading">
        <div>
          <h2>{filterLabel}</h2>
          <p>{visibleCharacters.length} {visibleCharacters.length === 1 ? "character" : "characters"} shown</p>
        </div>
        <label className="search-field">
          <span className="sr-only">Search characters</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search characters"
            type="search"
            value={query}
          />
        </label>
      </div>

      {visibleCharacters.length > 0 ? (
        <div className="character-list">
          {visibleCharacters.map((character) => <CharacterCard character={character} key={character.id} />)}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-emblem" aria-hidden="true">V</div>
          <h2>{query ? "No characters found" : filter === "archived" ? "No archived characters" : "Your vault is ready"}</h2>
          <p>{query ? "Try another name, campaign, ancestry, or class." : "Create your first character manually or import one from documents and photos."}</p>
          {!query && filter !== "archived" && <div className="empty-create-actions"><a className="primary-button button-link" href="#character/new">Create manually</a><a className="secondary-button button-link" href="#import">Import from PDF / Photos</a></div>}
        </div>
      )}
    </section>
  );
}
