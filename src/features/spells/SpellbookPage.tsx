import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import { SourceBadge } from "../../components/SourceBadge";
import { DiceRoller } from "../../components/DiceRoller";
import type { RulesSource, Spell, SpellActionType } from "../../domain/models";
import {
  catalogSourceChoice,
  catalogSpell,
  catalogSpells,
  characterSourceClassChoices,
  findCatalogSpellByName,
  searchCatalogSpells,
  spellCatalogMetadata,
  suggestCatalogSpells,
  type CatalogSpellDefinition,
} from "../../rules/spellCatalog";
import { contentSources, defaultEnabledContentSourceIds, FFXIV_CONTENT_SOURCE_ID, SRD_CONTENT_SOURCE_ID } from "../../rules/contentSources";
import { db, getSettings } from "../../storage/database";
import { createEmptyCharacterSheet, saveCharacterSheet } from "../../storage/characterSheets";
import { applyRestRecovery, buildRestPreview, restLabels, type RestKind } from "../../rules/spellSlots";
import { SpellDetailOverlay } from "./SpellDetailOverlay";
import { SpellSlotTracker } from "./SpellSlotTracker";
import {
  createSpell,
  addReferenceSpell,
  addSpellFromCatalog,
  createEmptySpell,
  createSpellFromCatalogDefinition,
  createReferenceSpellDraft,
  deleteSpell,
  duplicateSpell,
  getOrCreateSpellbook,
  movePinnedSpell,
  missingReferenceCompletionFields,
  replaceCustomSpellWithCatalogDefinition,
  saveSpell,
  saveAndAddReferenceSpell,
  setSpellPinned,
} from "../../storage/spellbooks";
import {
  buildClassChapters,
  catalogEligibility,
  defaultSpellbookPosition,
  groupOwnedSpellsByLevel,
  parseSpellbookPosition,
  spellsForClassChapter,
  type ClassChapter,
  type SpellbookPageId,
  type SpellbookPosition,
} from "./spellbookExperience";

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
  source: string;
  sourceClass: string;
  pinned: string;
  prepared: string;
  available: string;
  owned: string;
  completeness: string;
  sort: string;
};

const emptyFilters: Filters = {
  query: "", level: "all", school: "all", concentration: "all", ritual: "all",
  damageType: "all", actionType: "all", source: "all", sourceClass: "all", pinned: "all", prepared: "all",
  available: "all", owned: "all", completeness: "all", sort: "level",
};

const bookPageOrder: SpellbookPageId[] = ["desk", "classes", "search", "owned", "resources"];

const bookPageLabels: Record<SpellbookPageId, string> = {
  desk: "Spellbook Desk",
  classes: "Table of Classes",
  chapter: "Class Chapter",
  search: "Search to Add",
  owned: "My Spells",
  resources: "Spell Resources",
};

function levelLabel(level: number | null) {
  return level === null ? "Level unknown" : level === 0 ? "Cantrip" : `Level ${level}`;
}

function spellTags(spell: Spell) {
  return [
    spell.concentration && "Concentration",
    spell.ritual && "Ritual",
    spell.alwaysPrepared ? "Always prepared" : spell.prepared && "Prepared",
    spell.imported && "Imported",
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
        <span className="spell-level-mark">{spell.levelKnown ? spell.level === 0 ? "C" : spell.level : "?"}</span>
        <span className="spell-card-copy">
          <span className="spell-title-row"><strong>{spell.name}</strong><SourceBadge source={spell.rulesSourceId || spell.source} />{spell.contentSourceId && spell.contentSourceId !== spell.rulesSourceId && <SourceBadge source={spell.contentSourceId} />}{spell.homebrew && !spell.contentSourceId && <small>Homebrew</small>}</span>
          <span>{spell.levelKnown ? levelLabel(spell.level) : "Level unknown"} · {spell.school}</span>
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

function CatalogSpellCard({ spell, owned, onOpen, enabledSourceIds, eligibility }: {
  spell: CatalogSpellDefinition;
  owned: boolean;
  onOpen: () => void;
  enabledSourceIds: string[];
  eligibility: string;
}) {
  const visibleClasses = spell.associations.filter((association) => association.contentSourceId === SRD_CONTENT_SOURCE_ID || enabledSourceIds.includes(association.contentSourceId)).map((association) => association.sourceClass);
  const classSummary = [...new Set(visibleClasses)].slice(0, 6).join(", ");
  const showsFfxiv = enabledSourceIds.includes(FFXIV_CONTENT_SOURCE_ID) && spell.contentSourceIds.includes(FFXIV_CONTENT_SOURCE_ID);
  return (
    <article className="spell-card catalog-spell-card" data-spell-id={spell.id}>
      <button aria-label={`Open ${spell.name} details`} className="spell-card-main catalog-spell-main" onClick={onOpen} type="button">
        <span className="spell-level-mark">{spell.level === null ? "?" : spell.level === 0 ? "C" : spell.level}</span>
        <span className="spell-card-copy">
          <span className="spell-title-row"><strong>{spell.name}</strong><SourceBadge source={spell.rulesSourceId} />{showsFfxiv && spell.rulesSourceId !== FFXIV_CONTENT_SOURCE_ID && <SourceBadge source={FFXIV_CONTENT_SOURCE_ID} />}</span>
          <span>{levelLabel(spell.level)} · {spell.school}{classSummary && ` · ${classSummary}`}</span>
          <span className="spell-tags">
            {spell.definitionStatus === "complete" && <small>{actionLabels[actionTypeFromDefinition(spell)]}</small>}
            {spell.concentration && <small>Concentration</small>}
            {spell.ritual && <small>Ritual</small>}
            {spell.definitionStatus === "unavailable" && <small className="incomplete-label">Definition unavailable</small>}
            <small className={eligibility === "Ready to add" ? "eligibility-ready" : "eligibility-note"}>{eligibility}</small>
          </span>
          <small className="catalog-description-preview">{spell.description || "The guide lists this spell by name, but complete rules are not present in the supplied PDF."}</small>
        </span>
      </button>
      <div className="catalog-card-state">{owned && <span className="owned-label">Already owned</span>}<span aria-hidden="true" className="catalog-open-affordance">View details</span></div>
    </article>
  );
}

function SpellLevelNavigation({ availableLevels, level, onChange }: { availableLevels: number[]; level: number; onChange: (level: number) => void }) {
  return <nav aria-label="Spell level chapters" className="spell-level-ribbons">{Array.from({ length: 10 }, (_, value) => {
    const available = availableLevels.includes(value);
    return <button aria-current={level === value ? "page" : undefined} className={level === value ? "spell-level-ribbon active" : "spell-level-ribbon"} disabled={!available} key={value} onClick={() => onChange(value)} type="button"><span>{value === 0 ? "Cantrips" : `Level ${value}`}</span></button>;
  })}</nav>;
}

function ClassChapterCard({ chapter, eligible, onOpen }: { chapter: ClassChapter; eligible: boolean; onOpen: () => void }) {
  return <button className="class-chapter-card" onClick={onOpen} type="button"><span className="chapter-number" aria-hidden="true">{chapter.name.slice(0, 1).toLocaleUpperCase()}</span><span className="class-chapter-copy"><span className="card-label">Chapter</span><strong>{chapter.name}</strong><small>{chapter.spellCount} associated {chapter.spellCount === 1 ? "spell" : "spells"}{chapter.incompleteCount ? ` · ${chapter.incompleteCount} incomplete` : ""}</small><span><SourceBadge source={chapter.contentSourceId} /> {eligible ? "Character class" : "Browse chapter"}</span></span><span className="chapter-open" aria-hidden="true">Open →</span></button>;
}

function BookNavigation({ page, onNavigate }: { page: SpellbookPageId; onNavigate: (page: SpellbookPageId) => void }) {
  const orderIndex = page === "chapter" ? 1 : bookPageOrder.indexOf(page);
  const previous = bookPageOrder[Math.max(0, orderIndex - 1)];
  const next = bookPageOrder[Math.min(bookPageOrder.length - 1, orderIndex + 1)];
  return <nav aria-label="Spellbook pages" className="book-navigation"><button disabled={orderIndex <= 0} onClick={() => onNavigate(previous)} type="button">← Previous</button><button onClick={() => onNavigate("desk")} type="button">⌂ Desk</button><button onClick={() => onNavigate("classes")} type="button">Contents</button><button onClick={() => onNavigate("search")} type="button">Search</button><button onClick={() => onNavigate("owned")} type="button">My Spells</button><button disabled={orderIndex >= bookPageOrder.length - 1} onClick={() => onNavigate(next)} type="button">Next →</button></nav>;
}

function FilterSheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])"))
        .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("button, input, select")?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, []);
  return <div className="spell-filter-sheet-backdrop" onMouseDown={onClose} role="presentation"><section aria-label={title} aria-modal="true" className="spell-filter-sheet" onMouseDown={(event) => event.stopPropagation()} ref={dialogRef} role="dialog"><header><div><span className="card-label">Refine this chapter</span><h2>{title}</h2></div><button aria-label="Close filters" className="module-overlay-close" onClick={onClose} type="button">X</button></header>{children}</section></div>;
}

function actionTypeFromDefinition(spell: CatalogSpellDefinition): SpellActionType {
  const normalized = spell.castingTime.toLocaleLowerCase();
  if (normalized.includes("bonus action")) return "bonusAction";
  if (normalized.includes("reaction")) return "reaction";
  if (normalized.includes("minute")) return "minute";
  if (normalized.includes("hour")) return "hour";
  return normalized.includes("action") ? "action" : "special";
}

function SpellEditor({ spell, onClose, onSaveAndAdd }: { spell: Spell; onClose: () => void; onSaveAndAdd?: (spell: Spell) => Promise<void> }) {
  const [draft, setDraft] = useState(spell);
  const [status, setStatus] = useState<"saved" | "unsaved" | "saving" | "error">("saved");
  const [reviewOpen, setReviewOpen] = useState(false);
  const editVersion = useRef(0);
  const completingReference = Boolean(draft.referenceDefinitionId && onSaveAndAdd);
  const missingCompletionFields = missingReferenceCompletionFields(draft);

  useEffect(() => {
    setDraft(spell);
    setStatus("saved");
  }, [spell.id]);

  useEffect(() => {
    if (onSaveAndAdd || status !== "unsaved") return;
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
  }, [draft, onSaveAndAdd, status]);

  useEffect(() => {
    const flush = () => {
      if (!onSaveAndAdd && status === "unsaved") void saveSpell(draft).then((saved) => {
        setDraft(saved);
        setStatus("saved");
      });
    };
    window.addEventListener("vault:flush", flush);
    return () => window.removeEventListener("vault:flush", flush);
  }, [draft, onSaveAndAdd, status]);

  const edit = <Key extends keyof Spell>(key: Key, value: Spell[Key]) => {
    editVersion.current += 1;
    setDraft((current) => ({ ...current, [key]: value, ...(completingReference && key !== "completionReviewed" ? { completionReviewed: false } : {}) }));
    setStatus("unsaved");
  };
  const saveCompletedReference = async () => {
    if (!onSaveAndAdd) return;
    setStatus("saving");
    try {
      await onSaveAndAdd(draft);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };
  const statusLabel = status === "saving" ? "Saving locally..." : status === "unsaved" ? "Unsaved changes" : status === "error" ? "Complete the required fields and review before saving" : completingReference ? "Complete the rules, then save this local definition" : "Saved locally";

  return (
    <article className="panel spell-editor">
      <div className="form-section-heading">
        <div><span className="card-label">{completingReference ? "Complete & Add local definition" : "Full spell detail"}</span><h2>{draft.name}</h2></div>
        <div className="spell-editor-heading-actions"><span className={status === "error" ? "save-state error" : "save-state"}>{statusLabel}</span><button className="secondary-button compact" onClick={onClose} type="button">Close detail</button></div>
      </div>

      <div className="spell-editor-flags">
        <label className="touch-toggle"><input checked={draft.homebrew} disabled={completingReference} onChange={(event) => edit("homebrew", event.target.checked)} type="checkbox" /><span>Custom / homebrew</span></label>
        <label className="touch-toggle"><input checked={draft.concentration} onChange={(event) => edit("concentration", event.target.checked)} type="checkbox" /><span>Concentration{completingReference && " · review required"}</span></label>
        <label className="touch-toggle"><input checked={draft.ritual} onChange={(event) => edit("ritual", event.target.checked)} type="checkbox" /><span>Ritual{completingReference && " · review required"}</span></label>
        <label className="touch-toggle"><input checked={draft.attackRollRequired} onChange={(event) => edit("attackRollRequired", event.target.checked)} type="checkbox" /><span>Attack roll required{completingReference && " · review required"}</span></label>
      </div>

      {completingReference && <section className="reference-completion-context"><span className="card-label">Known FFXIV reference metadata</span><p><SourceBadge source={draft.contentSourceId || draft.rulesSourceId} /> Reference ID: {draft.referenceDefinitionId}</p><p>Source pages: {draft.referenceSourcePages.join(", ") || "not supplied"} · Available classes: {draft.referenceClasses.join(", ") || "not supplied"}</p><p>Level and source association are locked to the imported reference. Fields marked * need your supplied rules.</p></section>}

      <div className="spell-form-grid">
        <label className="form-field spell-name-field"><span>Spell name *</span><input maxLength={200} onChange={(event) => edit("name", event.target.value)} readOnly={completingReference} required value={draft.name} /></label>
        <label className="form-field"><span>Spell level</span><select disabled={completingReference} onChange={(event) => edit("level", Number(event.target.value))} value={draft.level}>{Array.from({ length: 10 }, (_, level) => <option key={level} value={level}>{levelLabel(level)}</option>)}</select></label>
        <label className="form-field"><span>School of magic *</span><input aria-label="School of magic" maxLength={100} onChange={(event) => edit("school", event.target.value)} required value={draft.school} /></label>
        <label className="form-field"><span>Casting time *</span><input aria-label="Casting time" maxLength={200} onChange={(event) => edit("castingTime", event.target.value)} required value={draft.castingTime} /></label>
        <label className="form-field"><span>Action type{completingReference && " · review required"}</span><select aria-label="Action type" onChange={(event) => edit("actionType", event.target.value as SpellActionType)} value={draft.actionType}>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="form-field"><span>Rules source</span>{completingReference ? <input readOnly value={contentSources.find((source) => source.id === draft.rulesSourceId)?.displayName ?? draft.rulesSourceId} /> : <select onChange={(event) => edit("source", event.target.value as RulesSource)} value={draft.source}><option value="Manual">Manual</option><option value="SRD">SRD</option><option value="Imported PDF">Imported PDF</option><option value="Homebrew">Homebrew</option></select>}</label>
        <label className="form-field"><span>Source class</span><input maxLength={100} onChange={(event) => edit("sourceClass", event.target.value)} placeholder="Druid, Wizard..." readOnly={completingReference} value={draft.sourceClass} /></label>
        <label className="form-field"><span>Casting ability override</span><select onChange={(event) => edit("castingAbilityOverride", event.target.value ? event.target.value as Spell["castingAbilityOverride"] : null)} value={draft.castingAbilityOverride ?? ""}><option value="">Use source class</option><option value="str">Strength</option><option value="dex">Dexterity</option><option value="con">Constitution</option><option value="int">Intelligence</option><option value="wis">Wisdom</option><option value="cha">Charisma</option></select></label>
        <label className="form-field"><span>Range *</span><input aria-label="Range" maxLength={200} onChange={(event) => edit("range", event.target.value)} required value={draft.range} /></label>
        <label className="form-field"><span>Duration *</span><input aria-label="Duration" maxLength={200} onChange={(event) => edit("duration", event.target.value)} required value={draft.duration} /></label>
        <fieldset className="spell-components"><legend>Components{completingReference && " · review required"}</legend><label><input checked={draft.verbalComponent} onChange={(event) => edit("verbalComponent", event.target.checked)} type="checkbox" /> V</label><label><input checked={draft.somaticComponent} onChange={(event) => edit("somaticComponent", event.target.checked)} type="checkbox" /> S</label><label><input checked={draft.materialComponent} onChange={(event) => edit("materialComponent", event.target.checked)} type="checkbox" /> M</label></fieldset>
        <label className="form-field full-width"><span>Material component details{completingReference && " · review required"}</span><input maxLength={1000} onChange={(event) => edit("materialDetails", event.target.value)} placeholder="A tiny ball of bat guano and sulfur..." value={draft.materialDetails} /></label>
      </div>

      <div className="spell-form-grid spell-effect-grid">
        <label className="form-field"><span>Damage type{completingReference && " · review required"}</span><input maxLength={100} onChange={(event) => edit("damageType", event.target.value)} placeholder="Fire, force, radiant..." value={draft.damageType} /></label>
        <label className="form-field"><span>Damage formula / dice{completingReference && " · review required"}</span><input maxLength={200} onChange={(event) => edit("damageFormula", event.target.value)} placeholder="8d6 fire damage" value={draft.damageFormula} /></label>
        <label className="form-field"><span>Healing formula{completingReference && " · review required"}</span><input maxLength={200} onChange={(event) => edit("healingFormula", event.target.value)} placeholder="1d8 + spellcasting modifier" value={draft.healingFormula} /></label>
        <div className="full-width"><DiceRoller compact context="Roll damage or healing here. Slots are not spent automatically." initialFormula={draft.damageFormula || draft.healingFormula || "d20"} label={`${draft.name} roll`} /></div>
        <label className="form-field"><span>Saving throw type{completingReference && " · review required"}</span><input maxLength={100} onChange={(event) => edit("savingThrowType", event.target.value)} placeholder="DEX, WIS..." value={draft.savingThrowType} /></label>
        <label className="form-field"><span>Area of effect type</span><input maxLength={100} onChange={(event) => edit("areaOfEffectType", event.target.value)} placeholder="Sphere, cone, line..." value={draft.areaOfEffectType} /></label>
        <label className="form-field"><span>Area of effect size</span><input maxLength={100} onChange={(event) => edit("areaOfEffectSize", event.target.value)} placeholder="20-foot radius" value={draft.areaOfEffectSize} /></label>
        <label className="form-field full-width"><span>Status effects / conditions applied</span><textarea onChange={(event) => edit("statusEffects", event.target.value)} placeholder="Charmed, restrained, blinded, special conditions..." rows={3} value={draft.statusEffects} /></label>
        <label className="form-field full-width"><span>Full spell description *</span><textarea aria-label="Full spell description" onChange={(event) => edit("description", event.target.value)} placeholder="Complete rules text and effect..." rows={10} value={draft.description} /></label>
        <label className="form-field full-width"><span>Higher level scaling{completingReference && " · review required"}</span><textarea onChange={(event) => edit("higherLevelScaling", event.target.value)} placeholder="At Higher Levels..." rows={4} value={draft.higherLevelScaling} /></label>
        <label className="form-field full-width"><span>Source / notes</span><textarea onChange={(event) => edit("sourceNotes", event.target.value)} placeholder="Book and page, DM rulings, preparation notes..." rows={4} value={draft.sourceNotes} /></label>
        <label className="form-field full-width"><span>Character notes</span><textarea onChange={(event) => edit("notes", event.target.value)} placeholder="Preparation choices, reminders, or character-specific changes..." rows={4} value={draft.notes} /></label>
      </div>
      {completingReference && <section className="reference-completion-review"><div className="form-section-heading"><div><span className="card-label">Review completed spell</span><h3>Check the rules before adding</h3><p>Confirm the action type, V/S/M, concentration, ritual, saving throw or attack, and damage or healing choices—even when the correct choice is “none.”</p></div><button className="secondary-button compact" onClick={() => setReviewOpen(true)} type="button">Review completed spell</button></div>{reviewOpen && <><p>{missingCompletionFields.length ? `Still required: ${missingCompletionFields.join(", ")}.` : "Required rule text is present."}</p><label className="touch-toggle"><input checked={draft.completionReviewed} onChange={(event) => edit("completionReviewed", event.target.checked)} type="checkbox" /><span>I reviewed all rule fields and intentionally supplied or left blank optional mechanics.</span></label><button className="primary-button" disabled={missingReferenceCompletionFields(draft).length > 0} onClick={() => void saveCompletedReference()} type="button">Save and Add to Character</button></>}</section>}
    </article>
  );
}

export function SpellbookPage({ characterId }: { characterId: string }) {
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const sheet = useLiveQuery(() => db.characterSheets.get(characterId), [characterId]);
  const spellbook = useLiveQuery(() => db.spellbooks.get(characterId), [characterId]);
  const settings = useLiveQuery(() => getSettings(), []);
  const spells = useLiveQuery(() => db.spells.where("characterId").equals(characterId).toArray(), [characterId]) ?? [];
  const [filters, setFilters] = useState(emptyFilters);
  const [catalogFilters, setCatalogFilters] = useState(emptyFilters);
  const [customSpellName, setCustomSpellName] = useState("");
  const [showCustomSpell, setShowCustomSpell] = useState(false);
  const [selectedSpellId, setSelectedSpellId] = useState("");
  const [selectedCatalogSpellId, setSelectedCatalogSpellId] = useState("");
  const [catalogSourceChoiceValue, setCatalogSourceChoiceValue] = useState("");
  const [completionDraft, setCompletionDraft] = useState<Spell | null>(null);
  const [message, setMessage] = useState("");
  const [bookPosition, setBookPosition] = useState<SpellbookPosition>(() => parseSpellbookPosition(window.localStorage.getItem(`vault:spellbook:${characterId}`)));
  const [filterSheet, setFilterSheet] = useState<"catalog" | "owned" | null>(null);

  useEffect(() => { void getOrCreateSpellbook(characterId); }, [characterId]);

  const navigateBook = useCallback((page: SpellbookPageId, update: Partial<SpellbookPosition> = {}) => {
    setBookPosition((current) => {
      const next = { ...current, ...update, page };
      window.history.pushState({ ...window.history.state, vaultSpellbook: { characterId, position: next } }, "", window.location.href);
      return next;
    });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [characterId]);

  useEffect(() => {
    window.localStorage.setItem(`vault:spellbook:${characterId}`, JSON.stringify(bookPosition));
  }, [bookPosition, characterId]);

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, vaultSpellbook: { characterId, position: bookPosition } }, "", window.location.href);
    const restore = (event: PopStateEvent) => {
      const saved = event.state?.vaultSpellbook;
      if (saved?.characterId === characterId) setBookPosition(saved.position);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [characterId]);

  const pinnedIds = spellbook?.pinnedSpellIds ?? [];
  const pinnedSpells = pinnedIds.map((id) => spells.find((spell) => spell.id === id)).filter((spell): spell is Spell => Boolean(spell));
  const schools = [...new Set(spells.map((spell) => spell.school).filter(Boolean))].sort();
  const damageTypes = [...new Set(spells.map((spell) => spell.damageType).filter(Boolean))].sort();
  const ownedSourceClasses = [...new Set(spells.map((spell) => spell.sourceClass).filter(Boolean))].sort();
  const enabledSourceIds = settings?.enabledContentSourceIds ?? defaultEnabledContentSourceIds;
  const enabledSourceKey = enabledSourceIds.join("|");
  const ownedDefinitionIds = useMemo(() => new Set(spells.flatMap((spell) => [spell.definitionId, spell.referenceDefinitionId]).filter(Boolean)), [spells]);
  const catalogMatches = useMemo(() => searchCatalogSpells(catalogFilters, enabledSourceIds).filter((spell) =>
    (catalogFilters.completeness === "all" || (catalogFilters.completeness === "complete") === (spell.definitionStatus === "complete"))
    && (catalogFilters.owned === "all" || ownedDefinitionIds.has(spell.id) === (catalogFilters.owned === "yes"))
  ), [catalogFilters, enabledSourceKey, ownedDefinitionIds]);
  const hasCatalogSearch = Boolean(catalogFilters.query.trim() || catalogFilters.level !== "all" || catalogFilters.school !== "all" || catalogFilters.concentration !== "all" || catalogFilters.ritual !== "all" || catalogFilters.actionType !== "all" || catalogFilters.source !== "all" || catalogFilters.sourceClass !== "all" || catalogFilters.owned !== "all" || catalogFilters.completeness !== "all");
  const catalogResults = hasCatalogSearch ? catalogMatches.slice(0, 60) : [];
  const exactCustomMatch = findCatalogSpellByName(customSpellName);
  const customSuggestions = useMemo(() => suggestCatalogSpells(customSpellName, enabledSourceIds).slice(0, 5), [customSpellName, enabledSourceKey]);
  const selectedCatalogDefinition = catalogSpell(selectedCatalogSpellId);
  const selectedCatalogOwned = selectedCatalogDefinition ? ownedDefinitionIds.has(selectedCatalogDefinition.id) : false;
  const selectedCatalogEligibility = selectedCatalogDefinition && character
    ? catalogEligibility(character, selectedCatalogDefinition, enabledSourceIds, selectedCatalogOwned)
    : { canAdd: false, reason: "Character unavailable", validChoices: [], requiredLevel: null };
  const catalogSourceChoices = selectedCatalogEligibility.validChoices;
  const selectedCatalogChoice = selectedCatalogDefinition ? catalogSourceChoice(selectedCatalogDefinition, catalogSourceChoiceValue, enabledSourceIds) : undefined;
  const selectedCatalogSpell = useMemo(() => {
    if (!selectedCatalogDefinition) return null;
    if (selectedCatalogDefinition.definitionStatus === "complete") return createSpellFromCatalogDefinition(characterId, selectedCatalogDefinition, selectedCatalogChoice);
    return {
      ...createEmptySpell(characterId, selectedCatalogDefinition.name),
      school: "Definition unavailable",
      definitionId: selectedCatalogDefinition.id,
      definitionVersion: selectedCatalogDefinition.sourceVersion,
      rulesSourceId: selectedCatalogDefinition.rulesSourceId,
      contentSourceId: FFXIV_CONTENT_SOURCE_ID,
      sourcePage: selectedCatalogDefinition.sourcePage,
      source: "Homebrew" as const,
      rulesComplete: false,
    };
  }, [characterId, selectedCatalogChoice, selectedCatalogDefinition]);
  const selectedCatalogContentSourceId = selectedCatalogChoice?.contentSourceId
    ?? (selectedCatalogDefinition?.contentSourceIds.includes(catalogFilters.source) ? catalogFilters.source : selectedCatalogDefinition?.rulesSourceId)
    ?? SRD_CONTENT_SOURCE_ID;
  const selectedCatalogSourcePage = selectedCatalogChoice?.page
    ?? selectedCatalogDefinition?.associations.find((association) => association.contentSourceId === selectedCatalogContentSourceId)?.page
    ?? selectedCatalogDefinition?.sourcePage
    ?? null;
  const catalogSheet = useMemo(() => sheet ?? createEmptyCharacterSheet(characterId), [characterId, sheet]);
  const ownedCatalogSpell = selectedCatalogDefinition ? spells.find((spell) => spell.definitionId === selectedCatalogDefinition.id || spell.referenceDefinitionId === selectedCatalogDefinition.id) : undefined;
  const classChapters = useMemo(() => buildClassChapters(catalogSpells, enabledSourceIds), [enabledSourceKey]);
  const selectedClassChapter = classChapters.find((chapter) => chapter.key === bookPosition.classKey);
  const chapterSpells = useMemo(() => selectedClassChapter ? spellsForClassChapter(catalogSpells, selectedClassChapter.key, bookPosition.level) : [], [bookPosition.classKey, bookPosition.level, selectedClassChapter]);
  const visibleSpells = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase();
    const filtered = spells.filter((spell) =>
      (!query || [spell.name, spell.description, spell.sourceNotes, spell.statusEffects, spell.sourceClass, spell.sourceSubclass, spell.rulesSourceId, spell.contentSourceId].some((value) => value.toLocaleLowerCase().includes(query)))
      && (filters.level === "all" || spell.level === Number(filters.level))
      && (filters.school === "all" || spell.school === filters.school)
      && (filters.concentration === "all" || spell.concentration === (filters.concentration === "yes"))
      && (filters.ritual === "all" || spell.ritual === (filters.ritual === "yes"))
      && (filters.damageType === "all" || spell.damageType === filters.damageType)
      && (filters.actionType === "all" || spell.actionType === filters.actionType)
      && (filters.sourceClass === "all" || spell.sourceClass === filters.sourceClass)
      && (filters.source === "all" || filters.source === "homebrew" && spell.homebrew || filters.source === SRD_CONTENT_SOURCE_ID && (spell.rulesSourceId === SRD_CONTENT_SOURCE_ID || spell.source === "SRD") || spell.contentSourceId === filters.source || spell.rulesSourceId === filters.source)
      && (filters.pinned === "all" || pinnedIds.includes(spell.id) === (filters.pinned === "yes")),
    );
    return filtered.sort((a, b) => filters.sort === "name"
      ? a.name.localeCompare(b.name)
      : filters.sort === "recent"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.level - b.level || a.name.localeCompare(b.name));
  }, [filters, pinnedIds, spells]);
  const gameplaySpells = visibleSpells.filter((spell) =>
    (filters.prepared === "all" || (spell.prepared || spell.alwaysPrepared || (sheet ? (spell.level === 0 ? sheet.cantrips : sheet.preparedSpells).toLocaleLowerCase().includes(spell.name.toLocaleLowerCase()) : false)) === (filters.prepared === "yes"))
    && (filters.available === "all" || (spell.rulesComplete && (spell.level === 0 || sheet && Object.entries(sheet.spellSlots).some(([level, maximum]) => Number(level) >= spell.level && maximum - (sheet.spellSlotsUsed[level] ?? 0) > 0))) === (filters.available === "yes"))
    && (filters.completeness === "all" || spell.rulesComplete === (filters.completeness === "complete"))
  );
  const ownedLevelGroups = groupOwnedSpellsByLevel(gameplaySpells);
  const selectedSpell = spells.find((spell) => spell.id === selectedSpellId);

  const createCustom = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (exactCustomMatch?.definitionStatus === "complete") {
        setCatalogFilters((current) => ({ ...current, query: exactCustomMatch.name }));
        setMessage(`${exactCustomMatch.name} already has a complete catalog definition. Add it above, or change the name to create a distinct custom spell.`);
        return;
      }
      const spell = await createSpell(characterId, customSpellName);
      setCustomSpellName("");
      setShowCustomSpell(false);
      setSelectedSpellId(spell.id);
      setMessage("Custom spell draft created. Complete its required rules before casting.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create spell");
    }
  };

  const addCatalogSpell = async (definition: CatalogSpellDefinition, sourceChoiceValue: string) => {
    try {
      const choice = catalogSourceChoice(definition, sourceChoiceValue, enabledSourceIds);
      if (!choice) throw new Error("Choose the spell's source class");
      await addSpellFromCatalog(characterId, definition, choice);
      const article = /^[aeiou]/i.test(choice.sourceClass) ? "an" : "a";
      setMessage(`${definition.name} added as ${article} ${choice.sourceClass} spell through ${contentSources.find((source) => source.id === choice.contentSourceId)?.displayName ?? choice.contentSourceId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add catalog spell");
    }
  };

  const openCatalogSpell = (definition: CatalogSpellDefinition) => {
    const owned = ownedDefinitionIds.has(definition.id);
    const choices = character ? catalogEligibility(character, definition, enabledSourceIds, owned).validChoices : [];
    setCatalogSourceChoiceValue(choices.length === 1 ? choices[0].value : "");
    setSelectedSpellId("");
    setSelectedCatalogSpellId(definition.id);
  };

  const closeCatalogSpell = () => {
    setSelectedCatalogSpellId("");
    setCatalogSourceChoiceValue("");
  };

  const viewOwnedCatalogSpell = () => {
    if (!ownedCatalogSpell) return;
    setSelectedCatalogSpellId("");
    setSelectedSpellId(ownedCatalogSpell.id);
  };

  const completeCatalogDefinition = () => {
    if (!selectedCatalogDefinition) return;
    const choice = catalogSourceChoice(selectedCatalogDefinition, catalogSourceChoiceValue, enabledSourceIds);
    if (!choice) {
      setMessage("Choose the FFXIV source class before completing this spell.");
      return;
    }
    setCompletionDraft(createReferenceSpellDraft(characterId, selectedCatalogDefinition, choice));
    closeCatalogSpell();
    setMessage(`${selectedCatalogDefinition.name} is ready for a local FFXIV completion. Its known level, source pages, reference ID, and class association were preserved.`);
  };

  const addCatalogReference = async () => {
    if (!selectedCatalogDefinition) return;
    try {
      const choice = catalogSourceChoice(selectedCatalogDefinition, catalogSourceChoiceValue, enabledSourceIds);
      if (!choice) throw new Error("Choose the FFXIV source class before adding this reference.");
      const reference = await addReferenceSpell(characterId, selectedCatalogDefinition, choice);
      closeCatalogSpell();
      setSelectedSpellId(reference.id);
      setMessage(`${reference.name} was added as a reference-only FFXIV spell. Complete its local rules before casting.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add reference spell");
    }
  };

  const saveCompletedReference = async (draft: Spell) => {
    try {
      const saved = await saveAndAddReferenceSpell(draft);
      setCompletionDraft(null);
      setSelectedSpellId(saved.id);
      setMessage(`${saved.name} was saved as a local completed definition and added to this character.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save completed spell");
      throw error;
    }
  };

  const repairSpell = async (spell: Spell, definition: CatalogSpellDefinition) => {
    if (definition.definitionStatus !== "complete") return;
    const choices = characterSourceClassChoices(character?.characterClass ?? "", definition, enabledSourceIds);
    const selectedValue = choices.length === 1 ? choices[0].value : window.prompt(`Which class grants ${definition.name}?\n${choices.map((choice) => choice.label).join(", ")}`, choices[0]?.value)?.trim();
    const choice = choices.find((candidate) => candidate.value === selectedValue);
    if (!choice) {
      setMessage("Choose one of the listed source classes to repair this spell.");
      return;
    }
    const sourceName = contentSources.find((source) => source.id === definition.rulesSourceId)?.displayName ?? definition.rulesSourceId;
    if (!window.confirm(`Replace ${spell.name}'s custom rule details with the ${sourceName} definition? Character notes, prepared status, and pinning will be preserved.`)) return;
    const repaired = await replaceCustomSpellWithCatalogDefinition(spell, definition, choice);
    setSelectedSpellId(repaired.id);
    setMessage(`${repaired.name} now uses ${sourceName} spell data`);
  };

  const remove = async (spell: Spell) => {
    if (!window.confirm(`Delete ${spell.name}?`)) return;
    await deleteSpell(characterId, spell.id);
    if (selectedSpellId === spell.id) setSelectedSpellId("");
  };

  const updateSheetFromSpellCast = async (nextSheet: NonNullable<typeof sheet>) => {
    await saveCharacterSheet(nextSheet);
    setMessage(`${selectedSpell?.name ?? "Spell"} cast and saved locally`);
  };

  const updateSpellSlotSheet = async (nextSheet: NonNullable<typeof sheet>) => {
    if (!sheet) return;
    await saveCharacterSheet(nextSheet);
  };

  const restPreviewText = (rest: RestKind) => {
    if (!sheet) return;
    const preview = buildRestPreview(sheet, rest);
    const recovering = preview.filter((resource) => resource.recovers);
    const notRecovering = preview.filter((resource) => !resource.recovers);
    return [
      `${restLabels[rest]} recovery preview`,
      recovering.length ? `Will recover:\n${recovering.map((resource) => `- ${resource.label}: ${resource.remainingBefore}/${resource.maximum} -> ${resource.remainingAfter}/${resource.maximum} remaining`).join("\n")}` : "Will recover: nothing",
      notRecovering.length ? `Will not recover:\n${notRecovering.map((resource) => `- ${resource.label}: ${resource.remainingBefore}/${resource.maximum} remaining (${resource.recovery.recoverOn})`).join("\n")}` : "Will not recover: none",
      "Apply this rest?",
    ].join("\n\n");
  };

  const applyRest = async (rest: RestKind) => {
    if (!sheet) return;
    const message = restPreviewText(rest);
    if (!message || !window.confirm(message)) return;
    await saveCharacterSheet(applyRestRecovery(sheet, rest));
    setMessage(`${restLabels[rest]} complete. Configured spell resources recovered.`);
  };

  if (!character) return <section className="page"><div className="loading-state">Opening spellbook...</div></section>;

  const openClassChapter = (chapter: ClassChapter) => navigateBook("chapter", { classKey: chapter.key, level: chapter.levels[0] ?? 0 });
  const availableOwnedLevels = ownedLevelGroups.map((group) => group.level);
  const navigateToBookPage = (page: SpellbookPageId) => navigateBook(page, page === "owned" ? { level: availableOwnedLevels[0] ?? 0 } : {});
  const chooseOwnedShortcut = (update: Partial<Filters>) => {
    setFilters({ ...emptyFilters, ...update });
    const preparedNames = `${sheet?.cantrips ?? ""},${sheet?.preparedSpells ?? ""}`.toLocaleLowerCase();
    const firstMatchingSpell = spells.find((spell) =>
      (update.pinned !== "yes" || pinnedIds.includes(spell.id))
      && (update.prepared !== "yes" || preparedNames.includes(spell.name.toLocaleLowerCase()))
      && (update.concentration !== "yes" || spell.concentration)
      && (update.ritual !== "yes" || spell.ritual)
    );
    navigateBook("owned", { level: firstMatchingSpell?.level ?? availableOwnedLevels[0] ?? 0 });
  };
  const visibleOwnedSpells = filters.query.trim() ? gameplaySpells : gameplaySpells.filter((spell) => spell.level === bookPosition.level);
  const characterClassName = character.characterClass.toLocaleLowerCase();

  return (
    <section className="page spellbook-page" data-book-page={bookPosition.page}>
      <PageHeader eyebrow="A living arcane reference" title={`${character.name}'s Spellbook`} description="Browse its chapters to discover new magic, or turn to My Spells for fast play at the table." actions={<div className="header-action-group"><button className="secondary-button" onClick={() => navigateBook("resources")} type="button">Spell resources</button><a className="secondary-button button-link" href={`#sheet/${characterId}`}>Character sheet</a></div>} />

      <div className="spellbook-volume">
        <aside className="spellbook-contents-page" aria-label="Spellbook contents">
          <div className="book-cover-mark" aria-hidden="true">V</div>
          <span className="card-label">Table of contents</span>
          <h2>{character.name}</h2>
          <p>Level {character.level} {character.characterClass || "adventurer"} · {spells.length} owned {spells.length === 1 ? "spell" : "spells"}</p>
          <nav>{bookPageOrder.map((page, index) => <button aria-current={bookPosition.page === page || bookPosition.page === "chapter" && page === "classes" ? "page" : undefined} className={bookPosition.page === page || bookPosition.page === "chapter" && page === "classes" ? "active" : ""} key={page} onClick={() => navigateToBookPage(page)} type="button"><span>{String(index + 1).padStart(2, "0")}</span>{bookPageLabels[page]}</button>)}</nav>
          <div className="book-source-key"><span className="card-label">Enabled volumes</span><SourceBadge source={SRD_CONTENT_SOURCE_ID} />{enabledSourceIds.map((sourceId) => <SourceBadge key={sourceId} source={sourceId} />)}</div>
        </aside>

        <article className="spellbook-leaf" key={`${bookPosition.page}-${bookPosition.classKey}-${bookPosition.level}`}>
          <div className="book-page-number">{bookPosition.page === "chapter" ? "II" : String(Math.max(1, bookPageOrder.indexOf(bookPosition.page) + 1)).padStart(2, "0")}</div>
          {message && <p className="inline-message spellbook-announcement" role="status">{message}</p>}

          {bookPosition.page === "desk" && <section className="book-page-content spellbook-desk" aria-labelledby="spellbook-desk-title">
            <header className="book-page-heading"><span className="card-label">Opening page</span><h2 id="spellbook-desk-title">Spellbook Desk</h2><p>Choose what you need. The catalog and your character’s owned magic stay deliberately separate.</p></header>
            <div className="desk-action-grid">
              <button className="desk-action-card discover" onClick={() => navigateBook("search")} type="button"><span className="desk-sigil" aria-hidden="true">✦</span><span className="card-label">Discover magic</span><strong>Search to Add</strong><p>Search every enabled source, read full rules, and add eligible spells.</p><span className="desk-action-link">Open the catalog →</span></button>
              <button className="desk-action-card owned" onClick={() => navigateToBookPage("owned")} type="button"><span className="desk-sigil" aria-hidden="true">⌁</span><span className="card-label">At the table</span><strong>Search Your Spells</strong><p>Find prepared, pinned, castable, or incomplete spells already tied to this character.</p><span className="desk-action-link">Open My Spells →</span></button>
            </div>
            <section className="desk-shortcuts" aria-labelledby="desk-shortcuts-title"><div className="book-section-heading"><div><span className="card-label">Bookmarks</span><h3 id="desk-shortcuts-title">Quick chapters</h3></div></div><div className="bookmark-grid"><button onClick={() => chooseOwnedShortcut({ pinned: "yes" })} type="button"><strong>{pinnedSpells.length}</strong><span>Pinned</span></button><button onClick={() => chooseOwnedShortcut({ prepared: "yes" })} type="button"><strong>{sheet?.preparedSpells.split(/\n|,/).filter((value) => value.trim()).length ?? 0}</strong><span>Prepared</span></button><button onClick={() => chooseOwnedShortcut({ concentration: "yes" })} type="button"><strong>{spells.filter((spell) => spell.concentration).length}</strong><span>Concentration</span></button><button onClick={() => chooseOwnedShortcut({ ritual: "yes" })} type="button"><strong>{spells.filter((spell) => spell.ritual).length}</strong><span>Rituals</span></button></div></section>
            {pinnedSpells.length > 0 && <section className="desk-pinned-preview"><div className="book-section-heading"><div><span className="card-label">Pinned ribbon</span><h3>Ready at hand</h3></div><button className="text-button" onClick={() => chooseOwnedShortcut({ pinned: "yes" })} type="button">View all</button></div><div className="book-spell-grid">{pinnedSpells.slice(0, 4).map((spell) => <SpellCard compact key={spell.id} onOpen={() => setSelectedSpellId(spell.id)} onPin={() => void setSpellPinned(characterId, spell.id, false)} pinned spell={spell} />)}</div></section>}
          </section>}

          {bookPosition.page === "classes" && <section className="book-page-content" aria-labelledby="class-contents-title"><header className="book-page-heading"><span className="card-label">Contents · Volume II</span><h2 id="class-contents-title">Table of Classes</h2><p>Each chapter is built from the class and subclass associations in your enabled sources.</p></header><div className="class-chapter-grid">{classChapters.map((chapter) => <ClassChapterCard chapter={chapter} eligible={characterClassName.includes(chapter.name.toLocaleLowerCase())} key={chapter.key} onOpen={() => openClassChapter(chapter)} />)}</div></section>}

          {bookPosition.page === "chapter" && selectedClassChapter && <section className="book-page-content" aria-labelledby="class-chapter-title"><header className="book-page-heading chapter-heading"><button className="text-button" onClick={() => navigateBook("classes")} type="button">← Table of Classes</button><span className="card-label">Class chapter</span><h2 id="class-chapter-title">{selectedClassChapter.name}</h2><p><SourceBadge source={selectedClassChapter.contentSourceId} /> {selectedClassChapter.spellCount} associated spells. Select a level ribbon to turn the chapter.</p></header><SpellLevelNavigation availableLevels={selectedClassChapter.levels} level={bookPosition.level} onChange={(level) => navigateBook("chapter", { level })} /><div className="book-spell-grid catalog-chapter-grid">{chapterSpells.length ? chapterSpells.map((definition) => { const eligibility = catalogEligibility(character, definition, enabledSourceIds, ownedDefinitionIds.has(definition.id)); return <CatalogSpellCard eligibility={eligibility.reason} enabledSourceIds={enabledSourceIds} key={definition.id} onOpen={() => openCatalogSpell(definition)} owned={ownedDefinitionIds.has(definition.id)} spell={definition} />; }) : <div className="spell-empty compact-empty"><strong>No spells on this page</strong><span>Choose another level ribbon.</span></div>}</div></section>}

          {bookPosition.page === "search" && <section className="book-page-content" aria-labelledby="catalog-search-title"><header className="book-page-heading"><span className="card-label">Discover magic</span><h2 id="catalog-search-title">Search to Add</h2><p>Search {spellCatalogMetadata.srdCount} canonical SRD spells and enabled optional volumes. Every result is readable; Add is reserved for eligible magic.</p></header><div className="book-search-bar"><label><span className="sr-only">Search the spell catalog</span><input autoComplete="off" onChange={(event) => setCatalogFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Spell name, class, school, source, or rules text…" type="search" value={catalogFilters.query} /></label><button className="secondary-button" onClick={() => setFilterSheet("catalog")} type="button">Filters{hasCatalogSearch && !catalogFilters.query ? " · Active" : ""}</button><button className="secondary-button" onClick={() => setShowCustomSpell((shown) => !shown)} type="button">Create Custom</button></div>{showCustomSpell && <form className="custom-spell-form" onSubmit={(event) => void createCustom(event)}><div><strong>Create a distinct custom spell</strong><p>Use this only for rules you own or create. Existing catalog matches stay separate.</p></div><div className="quick-add-row spell-add-row"><label className="sr-only" htmlFor={`custom-spell-${characterId}`}>Custom spell name</label><input id={`custom-spell-${characterId}`} maxLength={200} onChange={(event) => setCustomSpellName(event.target.value)} placeholder="Custom spell name…" value={customSpellName} /><button className="primary-button" disabled={!customSpellName.trim()} type="submit">Create Draft</button></div>{exactCustomMatch?.definitionStatus === "complete" && <p className="inline-message">{exactCustomMatch.name} already has a complete catalog definition.</p>}{exactCustomMatch?.definitionStatus !== "complete" && customSuggestions.length > 0 && <div className="custom-spell-suggestions"><strong>Catalog matches</strong>{customSuggestions.map((suggestion) => <button className="text-button" key={suggestion.id} onClick={() => { setCatalogFilters((current) => ({ ...current, query: suggestion.name })); setShowCustomSpell(false); }} type="button">{suggestion.name}</button>)}</div>}</form>}<div className="book-search-results" aria-live="polite">{!hasCatalogSearch ? <div className="book-introduction"><span aria-hidden="true">✧</span><h3>The catalog waits for a query</h3><p>Search by name or open Filters to begin with a level, school, source, concentration, ritual, action type, or definition status. No giant default list is loaded.</p><button className="text-button" onClick={() => navigateBook("classes")} type="button">Browse the Table of Classes instead →</button></div> : catalogResults.length ? <div className="book-spell-grid catalog-chapter-grid">{catalogResults.map((definition) => { const eligibility = catalogEligibility(character, definition, enabledSourceIds, ownedDefinitionIds.has(definition.id)); return <CatalogSpellCard eligibility={eligibility.reason} enabledSourceIds={enabledSourceIds} key={definition.id} onOpen={() => openCatalogSpell(definition)} owned={ownedDefinitionIds.has(definition.id)} spell={definition} />; })}</div> : <div className="spell-empty"><strong>No catalog spells match</strong><span>Adjust the query or enable the optional source in Settings.</span></div>}</div>{hasCatalogSearch && catalogMatches.length > catalogResults.length && <p className="catalog-limit-note">Showing the first {catalogResults.length} of {catalogMatches.length} matches.</p>}</section>}

          {bookPosition.page === "owned" && <section className="book-page-content" aria-labelledby="owned-spells-title"><header className="book-page-heading"><span className="card-label">Character volume</span><h2 id="owned-spells-title">My Spells</h2><p>{spells.length} locally owned {spells.length === 1 ? "spell" : "spells"}, arranged for fast use during play.</p></header><div className="book-search-bar"><label><span className="sr-only">Search owned spells</span><input autoComplete="off" onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Search your spells…" type="search" value={filters.query} /></label><button className="secondary-button" onClick={() => setFilterSheet("owned")} type="button">Filters</button><button className="secondary-button" onClick={() => setFilters(emptyFilters)} type="button">Clear</button></div>{!filters.query.trim() && <SpellLevelNavigation availableLevels={availableOwnedLevels} level={bookPosition.level} onChange={(level) => navigateBook("owned", { level })} />}<div className="book-spell-grid owned-chapter-grid">{visibleOwnedSpells.length ? visibleOwnedSpells.map((spell) => { const repairDefinition = spell.homebrew && !spell.definitionId ? findCatalogSpellByName(spell.name) : undefined; return <div className="owned-spell-entry" key={spell.id}><SpellCard onOpen={() => setSelectedSpellId(spell.id)} onPin={() => void setSpellPinned(characterId, spell.id, !pinnedIds.includes(spell.id))} pinned={pinnedIds.includes(spell.id)} spell={spell} /><div className="owned-entry-actions">{repairDefinition?.definitionStatus === "complete" && <button className="text-button" onClick={() => void repairSpell(spell, repairDefinition)} type="button">Use catalog data</button>}<button className="text-button" onClick={() => void duplicateSpell(characterId, spell.id).then((copy) => setSelectedSpellId(copy.id))} type="button">Duplicate</button><button className="text-button danger" onClick={() => void remove(spell)} type="button">Delete</button></div></div>; }) : <div className="spell-empty"><strong>{spells.length ? "No spells on this page" : "This spellbook is empty"}</strong><span>{spells.length ? "Choose another level or clear filters." : "Discover a spell in Search to Add."}</span></div>}</div></section>}

          {bookPosition.page === "resources" && <section className="book-page-content" aria-labelledby="spell-resources-title"><header className="book-page-heading"><span className="card-label">Reference appendix</span><h2 id="spell-resources-title">Spell Resources</h2><p>Manage slot pools and rest recovery without interrupting the catalog or owned-spell chapters.</p></header>{sheet ? <><div className="resource-actions"><button className="secondary-button" onClick={() => void applyRest("shortRest")} type="button">Short Rest</button><button className="primary-button" onClick={() => void applyRest("longRest")} type="button">Long Rest</button></div><SpellSlotTracker onChange={(nextSheet) => void updateSpellSlotSheet(nextSheet)} sheet={sheet} /></> : <div className="spell-empty"><strong>No character sheet yet</strong><span>Open the character sheet to configure spell slots.</span></div>}</section>}

          <BookNavigation onNavigate={navigateToBookPage} page={bookPosition.page} />
        </article>
      </div>

      {filterSheet === "catalog" && <FilterSheet onClose={() => setFilterSheet(null)} title="Catalog filters"><div className="spell-filter-sheet-grid"><label className="form-field"><span>Source</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, source: event.target.value }))} value={catalogFilters.source}><option value="all">All enabled sources</option><option value={SRD_CONTENT_SOURCE_ID}>SRD 5.2.1</option>{contentSources.filter((source) => source.optional).map((source) => <option disabled={!enabledSourceIds.includes(source.id)} key={source.id} value={source.id}>{source.displayName}</option>)}</select></label><label className="form-field"><span>Class or subclass</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, sourceClass: event.target.value }))} value={catalogFilters.sourceClass}><option value="all">All classes</option>{[...new Set(classChapters.map((chapter) => chapter.name))].map((name) => <option key={name}>{name}</option>)}</select></label><label className="form-field"><span>Level</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, level: event.target.value }))} value={catalogFilters.level}><option value="all">All levels</option>{Array.from({ length: 10 }, (_, level) => <option key={level} value={level}>{levelLabel(level)}</option>)}</select></label><label className="form-field"><span>School</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, school: event.target.value }))} value={catalogFilters.school}><option value="all">All schools</option>{spellCatalogMetadata.schools.map((school) => <option key={school}>{school}</option>)}</select></label><label className="form-field"><span>Action type</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, actionType: event.target.value }))} value={catalogFilters.actionType}><option value="all">All actions</option>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>Concentration</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, concentration: event.target.value }))} value={catalogFilters.concentration}><option value="all">Either</option><option value="yes">Concentration</option><option value="no">No concentration</option></select></label><label className="form-field"><span>Ritual</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, ritual: event.target.value }))} value={catalogFilters.ritual}><option value="all">Either</option><option value="yes">Ritual</option><option value="no">Not ritual</option></select></label><label className="form-field"><span>Ownership</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, owned: event.target.value }))} value={catalogFilters.owned}><option value="all">Owned and unowned</option><option value="no">Not owned</option><option value="yes">Already owned</option></select></label><label className="form-field"><span>Definition</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, completeness: event.target.value }))} value={catalogFilters.completeness}><option value="all">Complete and incomplete</option><option value="complete">Complete rules</option><option value="incomplete">Definition unavailable</option></select></label></div><footer><button className="secondary-button" onClick={() => setCatalogFilters(emptyFilters)} type="button">Clear filters</button><button className="primary-button" onClick={() => setFilterSheet(null)} type="button">Show results</button></footer></FilterSheet>}

      {filterSheet === "owned" && <FilterSheet onClose={() => setFilterSheet(null)} title="My Spells filters"><div className="spell-filter-sheet-grid"><label className="form-field"><span>Level</span><select onChange={(event) => setFilters((current) => ({ ...current, level: event.target.value }))} value={filters.level}><option value="all">All levels</option>{Array.from({ length: 10 }, (_, level) => <option key={level} value={level}>{levelLabel(level)}</option>)}</select></label><label className="form-field"><span>Source</span><select onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))} value={filters.source}><option value="all">All sources</option><option value={SRD_CONTENT_SOURCE_ID}>SRD 5.2.1</option><option value="homebrew">Custom / homebrew</option>{contentSources.filter((source) => source.optional).map((source) => <option key={source.id} value={source.id}>{source.displayName}</option>)}</select></label><label className="form-field"><span>Source class</span><select onChange={(event) => setFilters((current) => ({ ...current, sourceClass: event.target.value }))} value={filters.sourceClass}><option value="all">All source classes</option>{ownedSourceClasses.map((sourceClass) => <option key={sourceClass}>{sourceClass}</option>)}</select></label><label className="form-field"><span>Pinned</span><select onChange={(event) => setFilters((current) => ({ ...current, pinned: event.target.value }))} value={filters.pinned}><option value="all">All</option><option value="yes">Pinned</option><option value="no">Not pinned</option></select></label><label className="form-field"><span>Prepared or known</span><select onChange={(event) => setFilters((current) => ({ ...current, prepared: event.target.value }))} value={filters.prepared}><option value="all">All</option><option value="yes">Prepared or known</option><option value="no">Not prepared or known</option></select></label><label className="form-field"><span>Available to cast</span><select onChange={(event) => setFilters((current) => ({ ...current, available: event.target.value }))} value={filters.available}><option value="all">All</option><option value="yes">Available now</option><option value="no">Unavailable now</option></select></label><label className="form-field"><span>Rules</span><select onChange={(event) => setFilters((current) => ({ ...current, completeness: event.target.value }))} value={filters.completeness}><option value="all">Complete and incomplete</option><option value="complete">Complete</option><option value="incomplete">Rules incomplete</option></select></label><label className="form-field"><span>Concentration</span><select onChange={(event) => setFilters((current) => ({ ...current, concentration: event.target.value }))} value={filters.concentration}><option value="all">Either</option><option value="yes">Concentration</option><option value="no">No concentration</option></select></label><label className="form-field"><span>Ritual</span><select onChange={(event) => setFilters((current) => ({ ...current, ritual: event.target.value }))} value={filters.ritual}><option value="all">Either</option><option value="yes">Ritual</option><option value="no">Not ritual</option></select></label><label className="form-field"><span>Sort</span><select onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))} value={filters.sort}><option value="level">Level, then name</option><option value="name">Name</option><option value="recent">Recently updated</option></select></label></div><footer><button className="secondary-button" onClick={() => setFilters(emptyFilters)} type="button">Clear filters</button><button className="primary-button" onClick={() => setFilterSheet(null)} type="button">Show spells</button></footer></FilterSheet>}

      {completionDraft && <SpellDetailOverlay
        editContent={<SpellEditor key={completionDraft.id} onClose={() => setCompletionDraft(null)} onSaveAndAdd={saveCompletedReference} spell={completionDraft} />}
        editorOpen
        onActivity={setMessage}
        onClose={() => setCompletionDraft(null)}
        onSheetChange={updateSheetFromSpellCast}
        sheet={catalogSheet}
        spell={completionDraft}
      />}

      {selectedSpell && !completionDraft && <SpellDetailOverlay
        editContent={<SpellEditor key={selectedSpell.id} onClose={() => setSelectedSpellId("")} onSaveAndAdd={selectedSpell.referenceDefinitionId ? saveCompletedReference : undefined} spell={selectedSpell} />}
        editorOpen={Boolean(selectedSpell.referenceDefinitionId && !selectedSpell.rulesComplete)}
        onActivity={setMessage}
        onClose={() => setSelectedSpellId("")}
        onSheetChange={updateSheetFromSpellCast}
        sheet={catalogSheet}
        spell={selectedSpell}
      />}

      {selectedCatalogSpell && selectedCatalogDefinition && <SpellDetailOverlay
        catalog={{
          classes: [...new Set(selectedCatalogDefinition.associations
            .filter((association) => association.contentSourceId === SRD_CONTENT_SOURCE_ID || enabledSourceIds.includes(association.contentSourceId))
            .map((association) => association.sourceClass))],
          sourceClass: catalogSourceChoiceValue,
          sourceChoices: catalogSourceChoices.map(({ value, label }) => ({ value, label })),
          complete: selectedCatalogDefinition.definitionStatus === "complete",
          displayLevel: levelLabel(selectedCatalogDefinition.level),
          rulesSourceId: selectedCatalogDefinition.rulesSourceId,
          contentSourceId: selectedCatalogContentSourceId,
          definitionPage: selectedCatalogDefinition.sourcePage,
          associationPage: selectedCatalogSourcePage,
          owned: Boolean(ownedCatalogSpell),
          canAdd: selectedCatalogEligibility.canAdd,
          eligibilityReason: selectedCatalogEligibility.reason,
          onAdd: () => void addCatalogSpell(selectedCatalogDefinition, catalogSourceChoiceValue),
          onCompleteAndAdd: selectedCatalogDefinition.definitionStatus === "unavailable" ? completeCatalogDefinition : undefined,
          onAddReferenceOnly: selectedCatalogDefinition.definitionStatus === "unavailable" ? () => void addCatalogReference() : undefined,
          onSourceClassChange: setCatalogSourceChoiceValue,
          onViewOwned: ownedCatalogSpell ? viewOwnedCatalogSpell : undefined,
        }}
        onActivity={setMessage}
        onClose={closeCatalogSpell}
        onSheetChange={updateSheetFromSpellCast}
        sheet={catalogSheet}
        spell={selectedCatalogSpell}
      />}
    </section>
  );
}
