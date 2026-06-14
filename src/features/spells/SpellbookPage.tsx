import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import type { Spell, SpellActionType } from "../../domain/models";
import { db } from "../../storage/database";
import {
  createSpell,
  deleteSpell,
  duplicateSpell,
  getOrCreateSpellbook,
  movePinnedSpell,
  saveSpell,
  setSpellPinned,
} from "../../storage/spellbooks";

const actionLabels: Record<SpellActionType, string> = {
  action: "Action",
  bonusAction: "Bonus action",
  reaction: "Reaction",
  minute: "Minute+",
  hour: "Hour+",
  special: "Special",
};

type Filters = {
  query: string;
  level: string;
  school: string;
  concentration: string;
  ritual: string;
  damageType: string;
  actionType: string;
  pinned: string;
  sort: string;
};

const emptyFilters: Filters = {
  query: "", level: "all", school: "all", concentration: "all", ritual: "all",
  damageType: "all", actionType: "all", pinned: "all", sort: "level",
};

function levelLabel(level: number) {
  return level === 0 ? "Cantrip" : `Level ${level}`;
}

function spellTags(spell: Spell) {
  return [
    spell.concentration && "Concentration",
    spell.ritual && "Ritual",
    actionLabels[spell.actionType],
    spell.damageType,
    spell.savingThrowType && `${spell.savingThrowType} save`,
    spell.attackRollRequired && "Attack roll",
    spell.range,
  ].filter(Boolean) as string[];
}

function SpellCard({
  compact = false,
  pinned,
  spell,
  onOpen,
  onPin,
  onMove,
}: {
  compact?: boolean;
  pinned: boolean;
  spell: Spell;
  onOpen: () => void;
  onPin: () => void;
  onMove?: (direction: -1 | 1) => void;
}) {
  return (
    <article className={compact ? "spell-card compact-spell-card" : "spell-card"}>
      <button className="spell-card-main" onClick={onOpen} type="button">
        <span className="spell-level-mark">{spell.level === 0 ? "C" : spell.level}</span>
        <span className="spell-card-copy">
          <span className="spell-title-row"><strong>{spell.name}</strong>{spell.homebrew && <small>Homebrew</small>}</span>
          <span>{levelLabel(spell.level)} · {spell.school}</span>
          <span className="spell-tags">{spellTags(spell).map((tag) => <small key={tag}>{tag}</small>)}</span>
        </span>
      </button>
      <div className="spell-card-actions">
        <button aria-label={pinned ? `Unpin ${spell.name}` : `Pin ${spell.name}`} className={pinned ? "pin-button active" : "pin-button"} onClick={onPin} title={pinned ? "Unpin spell" : "Pin spell"} type="button">Pin</button>
        {onMove && <><button aria-label={`Move ${spell.name} earlier`} className="pin-move" onClick={() => onMove(-1)} type="button">←</button><button aria-label={`Move ${spell.name} later`} className="pin-move" onClick={() => onMove(1)} type="button">→</button></>}
      </div>
    </article>
  );
}

function SpellEditor({ spell, onClose }: { spell: Spell; onClose: () => void }) {
  const [draft, setDraft] = useState(spell);
  const [status, setStatus] = useState<"saved" | "unsaved" | "saving" | "error">("saved");
  const editVersion = useRef(0);

  useEffect(() => {
    setDraft(spell);
    setStatus("saved");
  }, [spell.id]);

  useEffect(() => {
    if (status !== "unsaved") return;
    const timer = window.setTimeout(async () => {
      const version = editVersion.current;
      setStatus("saving");
      try {
        const saved = await saveSpell(draft);
        if (version === editVersion.current) {
          setDraft(saved);
          setStatus("saved");
        } else setStatus("unsaved");
      } catch {
        setStatus("error");
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, status]);

  const edit = <Key extends keyof Spell>(key: Key, value: Spell[Key]) => {
    editVersion.current += 1;
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("unsaved");
  };
  const statusLabel = status === "saving" ? "Saving locally..." : status === "unsaved" ? "Unsaved changes" : status === "error" ? "Complete required fields to save" : "Saved locally";

  return (
    <article className="panel spell-editor">
      <div className="form-section-heading">
        <div><span className="card-label">Full spell detail</span><h2>{draft.name}</h2></div>
        <div className="spell-editor-heading-actions"><span className={status === "error" ? "save-state error" : "save-state"}>{statusLabel}</span><button className="secondary-button compact" onClick={onClose} type="button">Close detail</button></div>
      </div>

      <div className="spell-editor-flags">
        <label className="touch-toggle"><input checked={draft.homebrew} onChange={(event) => edit("homebrew", event.target.checked)} type="checkbox" /><span>Custom / homebrew</span></label>
        <label className="touch-toggle"><input checked={draft.concentration} onChange={(event) => edit("concentration", event.target.checked)} type="checkbox" /><span>Concentration</span></label>
        <label className="touch-toggle"><input checked={draft.ritual} onChange={(event) => edit("ritual", event.target.checked)} type="checkbox" /><span>Ritual</span></label>
        <label className="touch-toggle"><input checked={draft.attackRollRequired} onChange={(event) => edit("attackRollRequired", event.target.checked)} type="checkbox" /><span>Attack roll required</span></label>
      </div>

      <div className="spell-form-grid">
        <label className="form-field spell-name-field"><span>Spell name *</span><input maxLength={200} onChange={(event) => edit("name", event.target.value)} required value={draft.name} /></label>
        <label className="form-field"><span>Spell level</span><select onChange={(event) => edit("level", Number(event.target.value))} value={draft.level}>{Array.from({ length: 10 }, (_, level) => <option key={level} value={level}>{levelLabel(level)}</option>)}</select></label>
        <label className="form-field"><span>School of magic *</span><input maxLength={100} onChange={(event) => edit("school", event.target.value)} required value={draft.school} /></label>
        <label className="form-field"><span>Casting time *</span><input maxLength={200} onChange={(event) => edit("castingTime", event.target.value)} required value={draft.castingTime} /></label>
        <label className="form-field"><span>Action type</span><select onChange={(event) => edit("actionType", event.target.value as SpellActionType)} value={draft.actionType}>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="form-field"><span>Range *</span><input maxLength={200} onChange={(event) => edit("range", event.target.value)} required value={draft.range} /></label>
        <label className="form-field"><span>Duration *</span><input maxLength={200} onChange={(event) => edit("duration", event.target.value)} required value={draft.duration} /></label>
        <fieldset className="spell-components"><legend>Components</legend><label><input checked={draft.verbalComponent} onChange={(event) => edit("verbalComponent", event.target.checked)} type="checkbox" /> V</label><label><input checked={draft.somaticComponent} onChange={(event) => edit("somaticComponent", event.target.checked)} type="checkbox" /> S</label><label><input checked={draft.materialComponent} onChange={(event) => edit("materialComponent", event.target.checked)} type="checkbox" /> M</label></fieldset>
        <label className="form-field full-width"><span>Material component details</span><input maxLength={1000} onChange={(event) => edit("materialDetails", event.target.value)} placeholder="A tiny ball of bat guano and sulfur..." value={draft.materialDetails} /></label>
      </div>

      <div className="spell-form-grid spell-effect-grid">
        <label className="form-field"><span>Damage type</span><input maxLength={100} onChange={(event) => edit("damageType", event.target.value)} placeholder="Fire, force, radiant..." value={draft.damageType} /></label>
        <label className="form-field"><span>Damage formula / dice</span><input maxLength={200} onChange={(event) => edit("damageFormula", event.target.value)} placeholder="8d6 fire damage" value={draft.damageFormula} /></label>
        <label className="form-field"><span>Healing formula</span><input maxLength={200} onChange={(event) => edit("healingFormula", event.target.value)} placeholder="1d8 + spellcasting modifier" value={draft.healingFormula} /></label>
        <label className="form-field"><span>Saving throw type</span><input maxLength={100} onChange={(event) => edit("savingThrowType", event.target.value)} placeholder="DEX, WIS..." value={draft.savingThrowType} /></label>
        <label className="form-field"><span>Area of effect type</span><input maxLength={100} onChange={(event) => edit("areaOfEffectType", event.target.value)} placeholder="Sphere, cone, line..." value={draft.areaOfEffectType} /></label>
        <label className="form-field"><span>Area of effect size</span><input maxLength={100} onChange={(event) => edit("areaOfEffectSize", event.target.value)} placeholder="20-foot radius" value={draft.areaOfEffectSize} /></label>
        <label className="form-field full-width"><span>Status effects / conditions applied</span><textarea onChange={(event) => edit("statusEffects", event.target.value)} placeholder="Charmed, restrained, blinded, special conditions..." rows={3} value={draft.statusEffects} /></label>
        <label className="form-field full-width"><span>Full spell description</span><textarea onChange={(event) => edit("description", event.target.value)} placeholder="Complete rules text and effect..." rows={10} value={draft.description} /></label>
        <label className="form-field full-width"><span>Higher level scaling</span><textarea onChange={(event) => edit("higherLevelScaling", event.target.value)} placeholder="At Higher Levels..." rows={4} value={draft.higherLevelScaling} /></label>
        <label className="form-field full-width"><span>Source / notes</span><textarea onChange={(event) => edit("sourceNotes", event.target.value)} placeholder="Book and page, DM rulings, preparation notes..." rows={4} value={draft.sourceNotes} /></label>
      </div>
    </article>
  );
}

export function SpellbookPage({ characterId }: { characterId: string }) {
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const spellbook = useLiveQuery(() => db.spellbooks.get(characterId), [characterId]);
  const spells = useLiveQuery(() => db.spells.where("characterId").equals(characterId).toArray(), [characterId]) ?? [];
  const [filters, setFilters] = useState(emptyFilters);
  const [newSpellName, setNewSpellName] = useState("");
  const [selectedSpellId, setSelectedSpellId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { void getOrCreateSpellbook(characterId); }, [characterId]);

  const pinnedIds = spellbook?.pinnedSpellIds ?? [];
  const pinnedSpells = pinnedIds.map((id) => spells.find((spell) => spell.id === id)).filter((spell): spell is Spell => Boolean(spell));
  const schools = [...new Set(spells.map((spell) => spell.school).filter(Boolean))].sort();
  const damageTypes = [...new Set(spells.map((spell) => spell.damageType).filter(Boolean))].sort();
  const visibleSpells = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase();
    const filtered = spells.filter((spell) =>
      (!query || [spell.name, spell.description, spell.sourceNotes, spell.statusEffects].some((value) => value.toLocaleLowerCase().includes(query)))
      && (filters.level === "all" || spell.level === Number(filters.level))
      && (filters.school === "all" || spell.school === filters.school)
      && (filters.concentration === "all" || spell.concentration === (filters.concentration === "yes"))
      && (filters.ritual === "all" || spell.ritual === (filters.ritual === "yes"))
      && (filters.damageType === "all" || spell.damageType === filters.damageType)
      && (filters.actionType === "all" || spell.actionType === filters.actionType)
      && (filters.pinned === "all" || pinnedIds.includes(spell.id) === (filters.pinned === "yes")),
    );
    return filtered.sort((a, b) => filters.sort === "name"
      ? a.name.localeCompare(b.name)
      : filters.sort === "recent"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.level - b.level || a.name.localeCompare(b.name));
  }, [filters, pinnedIds, spells]);
  const selectedSpell = spells.find((spell) => spell.id === selectedSpellId);

  const addSpell = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const spell = await createSpell(characterId, newSpellName);
      setNewSpellName("");
      setSelectedSpellId(spell.id);
      setMessage("Spell created and stored locally");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create spell");
    }
  };

  const remove = async (spell: Spell) => {
    if (!window.confirm(`Delete ${spell.name}?`)) return;
    await deleteSpell(characterId, spell.id);
    if (selectedSpellId === spell.id) setSelectedSpellId("");
  };

  if (!character) return <section className="page"><div className="loading-state">Opening spellbook...</div></section>;

  return (
    <section className="page spellbook-page">
      <PageHeader eyebrow="At-the-table reference" title={`${character.name}'s Spellbook`} description="Pinned shortcuts and complete editable spell rules, stored only on this device." actions={<div className="header-action-group"><a className="secondary-button button-link" href={`#sheet/${characterId}`}>Character sheet</a><a className="secondary-button button-link" href="#characters">Characters</a></div>} />

      <article className="panel pinned-spells-panel">
        <div className="form-section-heading"><div><span className="card-label">Quick access</span><h2>Pinned spells</h2><p>Pin your most-used spells, then use the arrows to set their table order.</p></div></div>
        {pinnedSpells.length ? <div className="pinned-spell-list">{pinnedSpells.map((spell) => <SpellCard compact key={spell.id} onMove={(direction) => void movePinnedSpell(characterId, spell.id, direction)} onOpen={() => setSelectedSpellId(spell.id)} onPin={() => void setSpellPinned(characterId, spell.id, false)} pinned spell={spell} />)}</div> : <div className="spell-empty compact-empty"><strong>No pinned spells yet</strong><span>Use Pin on any spell to place it here.</span></div>}
      </article>

      {selectedSpell && <SpellEditor key={selectedSpell.id} onClose={() => setSelectedSpellId("")} spell={selectedSpell} />}

      <article className="panel spellbook-library">
        <div className="form-section-heading"><div><span className="card-label">Character-owned magic</span><h2>All spells</h2><p>{spells.length} {spells.length === 1 ? "spell" : "spells"} stored locally for this character.</p></div></div>
        <form className="quick-add-row spell-add-row" onSubmit={(event) => void addSpell(event)}><label className="sr-only" htmlFor={`spell-${characterId}`}>New spell name</label><input id={`spell-${characterId}`} maxLength={200} onChange={(event) => setNewSpellName(event.target.value)} placeholder="Type a spell name..." value={newSpellName} /><button className="primary-button" disabled={!newSpellName.trim()} type="submit">Add spell</button></form>
        {message && <p className="inline-message inventory-message" role="status">{message}</p>}

        <div className="spell-filters">
          <label className="form-field spell-search"><span>Search</span><input onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Name, description, conditions..." type="search" value={filters.query} /></label>
          <label className="form-field"><span>Level</span><select onChange={(event) => setFilters((current) => ({ ...current, level: event.target.value }))} value={filters.level}><option value="all">All levels</option>{Array.from({ length: 10 }, (_, level) => <option key={level} value={level}>{levelLabel(level)}</option>)}</select></label>
          <label className="form-field"><span>School</span><select onChange={(event) => setFilters((current) => ({ ...current, school: event.target.value }))} value={filters.school}><option value="all">All schools</option>{schools.map((school) => <option key={school}>{school}</option>)}</select></label>
          <label className="form-field"><span>Action type</span><select onChange={(event) => setFilters((current) => ({ ...current, actionType: event.target.value }))} value={filters.actionType}><option value="all">All action types</option>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-field"><span>Damage type</span><select onChange={(event) => setFilters((current) => ({ ...current, damageType: event.target.value }))} value={filters.damageType}><option value="all">All damage types</option>{damageTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="form-field"><span>Concentration</span><select onChange={(event) => setFilters((current) => ({ ...current, concentration: event.target.value }))} value={filters.concentration}><option value="all">Either</option><option value="yes">Concentration</option><option value="no">No concentration</option></select></label>
          <label className="form-field"><span>Ritual</span><select onChange={(event) => setFilters((current) => ({ ...current, ritual: event.target.value }))} value={filters.ritual}><option value="all">Either</option><option value="yes">Ritual</option><option value="no">Not ritual</option></select></label>
          <label className="form-field"><span>Pinned</span><select onChange={(event) => setFilters((current) => ({ ...current, pinned: event.target.value }))} value={filters.pinned}><option value="all">All spells</option><option value="yes">Pinned only</option><option value="no">Unpinned only</option></select></label>
          <label className="form-field"><span>Sort by</span><select onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))} value={filters.sort}><option value="level">Level then name</option><option value="name">Name</option><option value="recent">Recently edited</option></select></label>
          <button className="secondary-button compact clear-spell-filters" onClick={() => setFilters(emptyFilters)} type="button">Clear filters</button>
        </div>

        <div className="spell-list">
          {visibleSpells.length ? visibleSpells.map((spell) => <div className="spell-list-row" key={spell.id}><SpellCard onOpen={() => setSelectedSpellId(spell.id)} onPin={() => void setSpellPinned(characterId, spell.id, !pinnedIds.includes(spell.id))} pinned={pinnedIds.includes(spell.id)} spell={spell} /><div className="spell-list-actions"><button className="text-button" onClick={() => void duplicateSpell(characterId, spell.id).then((copy) => setSelectedSpellId(copy.id))} type="button">Duplicate</button><button className="text-button danger" onClick={() => void remove(spell)} type="button">Delete</button></div></div>) : <div className="spell-empty"><strong>{spells.length ? "No spells match these filters" : "This spellbook is empty"}</strong><span>{spells.length ? "Clear or adjust filters to see more spells." : "Add a spell manually to begin."}</span></div>}
        </div>
      </article>
    </section>
  );
}
