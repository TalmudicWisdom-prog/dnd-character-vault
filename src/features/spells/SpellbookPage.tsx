import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import { SourceBadge } from "../../components/SourceBadge";
import { DiceRoller } from "../../components/DiceRoller";
import type { RulesSource, Spell, SpellActionType } from "../../domain/models";
import {
  catalogSourceChoice,
  catalogSpell,
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
  addSpellFromCatalog,
  createEmptySpell,
  createSpellFromCatalogDefinition,
  deleteSpell,
  duplicateSpell,
  getOrCreateSpellbook,
  movePinnedSpell,
  replaceCustomSpellWithCatalogDefinition,
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
  source: string;
  pinned: string;
  sort: string;
};

const emptyFilters: Filters = {
  query: "", level: "all", school: "all", concentration: "all", ritual: "all",
  damageType: "all", actionType: "all", source: "all", pinned: "all", sort: "level",
};

function levelLabel(level: number | null) {
  return level === null ? "Level unknown" : level === 0 ? "Cantrip" : `Level ${level}`;
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
          <span className="spell-title-row"><strong>{spell.name}</strong><SourceBadge source={spell.rulesSourceId || spell.source} />{spell.contentSourceId && spell.contentSourceId !== spell.rulesSourceId && <SourceBadge source={spell.contentSourceId} />}{spell.homebrew && !spell.contentSourceId && <small>Homebrew</small>}</span>
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

function CatalogSpellCard({ spell, owned, onOpen, enabledSourceIds }: {
  spell: CatalogSpellDefinition;
  owned: boolean;
  onOpen: () => void;
  enabledSourceIds: string[];
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
          </span>
          <small className="catalog-description-preview">{spell.description || "The guide lists this spell by name, but complete rules are not present in the supplied PDF."}</small>
        </span>
      </button>
      <div className="catalog-card-state">{owned && <span className="owned-label">Already owned</span>}<span aria-hidden="true" className="catalog-open-affordance">View details</span></div>
    </article>
  );
}

function actionTypeFromDefinition(spell: CatalogSpellDefinition): SpellActionType {
  const normalized = spell.castingTime.toLocaleLowerCase();
  if (normalized.includes("bonus action")) return "bonusAction";
  if (normalized.includes("reaction")) return "reaction";
  if (normalized.includes("minute")) return "minute";
  if (normalized.includes("hour")) return "hour";
  return normalized.includes("action") ? "action" : "special";
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

  useEffect(() => {
    const flush = () => {
      if (status === "unsaved") void saveSpell(draft).then((saved) => {
        setDraft(saved);
        setStatus("saved");
      });
    };
    window.addEventListener("vault:flush", flush);
    return () => window.removeEventListener("vault:flush", flush);
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
        <label className="form-field"><span>Rules source</span><select onChange={(event) => edit("source", event.target.value as RulesSource)} value={draft.source}><option value="Manual">Manual</option><option value="SRD">SRD</option><option value="Imported PDF">Imported PDF</option><option value="Homebrew">Homebrew</option></select></label>
        <label className="form-field"><span>Source class</span><input maxLength={100} onChange={(event) => edit("sourceClass", event.target.value)} placeholder="Druid, Wizard..." value={draft.sourceClass} /></label>
        <label className="form-field"><span>Casting ability override</span><select onChange={(event) => edit("castingAbilityOverride", event.target.value ? event.target.value as Spell["castingAbilityOverride"] : null)} value={draft.castingAbilityOverride ?? ""}><option value="">Use source class</option><option value="str">Strength</option><option value="dex">Dexterity</option><option value="con">Constitution</option><option value="int">Intelligence</option><option value="wis">Wisdom</option><option value="cha">Charisma</option></select></label>
        <label className="form-field"><span>Range *</span><input maxLength={200} onChange={(event) => edit("range", event.target.value)} required value={draft.range} /></label>
        <label className="form-field"><span>Duration *</span><input maxLength={200} onChange={(event) => edit("duration", event.target.value)} required value={draft.duration} /></label>
        <fieldset className="spell-components"><legend>Components</legend><label><input checked={draft.verbalComponent} onChange={(event) => edit("verbalComponent", event.target.checked)} type="checkbox" /> V</label><label><input checked={draft.somaticComponent} onChange={(event) => edit("somaticComponent", event.target.checked)} type="checkbox" /> S</label><label><input checked={draft.materialComponent} onChange={(event) => edit("materialComponent", event.target.checked)} type="checkbox" /> M</label></fieldset>
        <label className="form-field full-width"><span>Material component details</span><input maxLength={1000} onChange={(event) => edit("materialDetails", event.target.value)} placeholder="A tiny ball of bat guano and sulfur..." value={draft.materialDetails} /></label>
      </div>

      <div className="spell-form-grid spell-effect-grid">
        <label className="form-field"><span>Damage type</span><input maxLength={100} onChange={(event) => edit("damageType", event.target.value)} placeholder="Fire, force, radiant..." value={draft.damageType} /></label>
        <label className="form-field"><span>Damage formula / dice</span><input maxLength={200} onChange={(event) => edit("damageFormula", event.target.value)} placeholder="8d6 fire damage" value={draft.damageFormula} /></label>
        <label className="form-field"><span>Healing formula</span><input maxLength={200} onChange={(event) => edit("healingFormula", event.target.value)} placeholder="1d8 + spellcasting modifier" value={draft.healingFormula} /></label>
        <div className="full-width"><DiceRoller compact context="Roll damage or healing here. Slots are not spent automatically." initialFormula={draft.damageFormula || draft.healingFormula || "d20"} label={`${draft.name} roll`} /></div>
        <label className="form-field"><span>Saving throw type</span><input maxLength={100} onChange={(event) => edit("savingThrowType", event.target.value)} placeholder="DEX, WIS..." value={draft.savingThrowType} /></label>
        <label className="form-field"><span>Area of effect type</span><input maxLength={100} onChange={(event) => edit("areaOfEffectType", event.target.value)} placeholder="Sphere, cone, line..." value={draft.areaOfEffectType} /></label>
        <label className="form-field"><span>Area of effect size</span><input maxLength={100} onChange={(event) => edit("areaOfEffectSize", event.target.value)} placeholder="20-foot radius" value={draft.areaOfEffectSize} /></label>
        <label className="form-field full-width"><span>Status effects / conditions applied</span><textarea onChange={(event) => edit("statusEffects", event.target.value)} placeholder="Charmed, restrained, blinded, special conditions..." rows={3} value={draft.statusEffects} /></label>
        <label className="form-field full-width"><span>Full spell description</span><textarea onChange={(event) => edit("description", event.target.value)} placeholder="Complete rules text and effect..." rows={10} value={draft.description} /></label>
        <label className="form-field full-width"><span>Higher level scaling</span><textarea onChange={(event) => edit("higherLevelScaling", event.target.value)} placeholder="At Higher Levels..." rows={4} value={draft.higherLevelScaling} /></label>
        <label className="form-field full-width"><span>Source / notes</span><textarea onChange={(event) => edit("sourceNotes", event.target.value)} placeholder="Book and page, DM rulings, preparation notes..." rows={4} value={draft.sourceNotes} /></label>
        <label className="form-field full-width"><span>Character notes</span><textarea onChange={(event) => edit("notes", event.target.value)} placeholder="Preparation choices, reminders, or character-specific changes..." rows={4} value={draft.notes} /></label>
      </div>
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
  const [message, setMessage] = useState("");

  useEffect(() => { void getOrCreateSpellbook(characterId); }, [characterId]);

  const pinnedIds = spellbook?.pinnedSpellIds ?? [];
  const pinnedSpells = pinnedIds.map((id) => spells.find((spell) => spell.id === id)).filter((spell): spell is Spell => Boolean(spell));
  const schools = [...new Set(spells.map((spell) => spell.school).filter(Boolean))].sort();
  const damageTypes = [...new Set(spells.map((spell) => spell.damageType).filter(Boolean))].sort();
  const enabledSourceIds = settings?.enabledContentSourceIds ?? defaultEnabledContentSourceIds;
  const enabledSourceKey = enabledSourceIds.join("|");
  const catalogMatches = useMemo(() => searchCatalogSpells(catalogFilters, enabledSourceIds), [catalogFilters, enabledSourceKey]);
  const catalogResults = catalogMatches.slice(0, 60);
  const exactCustomMatch = findCatalogSpellByName(customSpellName);
  const customSuggestions = useMemo(() => suggestCatalogSpells(customSpellName, enabledSourceIds).slice(0, 5), [customSpellName, enabledSourceKey]);
  const ownedDefinitionIds = new Set(spells.map((spell) => spell.definitionId).filter(Boolean));
  const selectedCatalogDefinition = catalogSpell(selectedCatalogSpellId);
  const catalogSourceChoices = selectedCatalogDefinition ? characterSourceClassChoices(character?.characterClass ?? "", selectedCatalogDefinition, enabledSourceIds) : [];
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
  const ownedCatalogSpell = selectedCatalogDefinition ? spells.find((spell) => spell.definitionId === selectedCatalogDefinition.id) : undefined;
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
      && (filters.source === "all" || filters.source === "homebrew" && spell.homebrew || filters.source === SRD_CONTENT_SOURCE_ID && (spell.rulesSourceId === SRD_CONTENT_SOURCE_ID || spell.source === "SRD") || spell.contentSourceId === filters.source || spell.rulesSourceId === filters.source)
      && (filters.pinned === "all" || pinnedIds.includes(spell.id) === (filters.pinned === "yes")),
    );
    return filtered.sort((a, b) => filters.sort === "name"
      ? a.name.localeCompare(b.name)
      : filters.sort === "recent"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.level - b.level || a.name.localeCompare(b.name));
  }, [filters, pinnedIds, spells]);
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
    const choices = characterSourceClassChoices(character?.characterClass ?? "", definition, enabledSourceIds);
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
    setCustomSpellName(selectedCatalogDefinition.name);
    setShowCustomSpell(true);
    closeCatalogSpell();
    setMessage(`${selectedCatalogDefinition.name} has no complete definition in the supplied guide. Review the source page, then create and complete a custom definition before casting.`);
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

  return (
    <section className="page spellbook-page">
      <PageHeader eyebrow="At-the-table reference" title={`${character.name}'s Spellbook`} description="Pinned shortcuts and complete editable spell rules, stored only on this device." actions={<div className="header-action-group"><a className="secondary-button button-link" href={`#sheet/${characterId}`}>Character sheet</a><a className="secondary-button button-link" href="#characters">Characters</a></div>} />

      <article className="panel pinned-spells-panel">
        <div className="form-section-heading"><div><span className="card-label">Quick access</span><h2>Pinned spells</h2><p>Pin your most-used spells, then use the arrows to set their table order.</p></div></div>
        {pinnedSpells.length ? <div className="pinned-spell-list">{pinnedSpells.map((spell) => <SpellCard compact key={spell.id} onMove={(direction) => void movePinnedSpell(characterId, spell.id, direction)} onOpen={() => setSelectedSpellId(spell.id)} onPin={() => void setSpellPinned(characterId, spell.id, false)} pinned spell={spell} />)}</div> : <div className="spell-empty compact-empty"><strong>No pinned spells yet</strong><span>Use Pin on any spell to place it here.</span></div>}
      </article>

      {sheet && <article className="panel spell-slot-panel">
        <div className="form-section-heading"><div><span className="card-label">Manual resources</span><h2>Spell slots</h2><p>Track slots by hand. Casting spends slots automatically.</p></div><div className="layout-customize-actions"><button className="secondary-button" onClick={() => void applyRest("shortRest")} type="button">Short Rest</button><button className="primary-button" onClick={() => void applyRest("longRest")} type="button">Long Rest</button></div></div>
        <div>
          <SpellSlotTracker onChange={(nextSheet) => void updateSpellSlotSheet(nextSheet)} sheet={sheet} />
        </div>
      </article>}

      {selectedSpell && <SpellDetailOverlay
        editContent={<SpellEditor key={selectedSpell.id} onClose={() => setSelectedSpellId("")} spell={selectedSpell} />}
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
          onAdd: () => void addCatalogSpell(selectedCatalogDefinition, catalogSourceChoiceValue),
          onCompleteDefinition: selectedCatalogDefinition.definitionStatus === "unavailable" ? completeCatalogDefinition : undefined,
          onSourceClassChange: setCatalogSourceChoiceValue,
          onViewOwned: ownedCatalogSpell ? viewOwnedCatalogSpell : undefined,
        }}
        onActivity={setMessage}
        onClose={closeCatalogSpell}
        onSheetChange={updateSheetFromSpellCast}
        sheet={catalogSheet}
        spell={selectedCatalogSpell}
      />}

      <article className="panel spell-catalog-panel">
        <div className="form-section-heading"><div><span className="card-label">Available catalog spells</span><h2>Add from Spell Catalog</h2><p>Search {spellCatalogMetadata.srdCount} canonical SRD spells plus enabled optional content. All catalog data works offline.</p></div><button className="secondary-button" onClick={() => setShowCustomSpell((shown) => !shown)} type="button">Create Custom Spell</button></div>
        <div className="spell-filters catalog-filters">
          <label className="form-field spell-search"><span>Search catalog</span><input onChange={(event) => setCatalogFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Name, level, school, class, or description..." type="search" value={catalogFilters.query} /></label>
          <label className="form-field"><span>Source</span><select aria-label="Spell source" onChange={(event) => setCatalogFilters((current) => ({ ...current, source: event.target.value }))} value={catalogFilters.source}><option value="all">All sources</option><option value={SRD_CONTENT_SOURCE_ID}>SRD 5.2.1</option>{contentSources.filter((source) => source.optional).map((source) => <option disabled={!enabledSourceIds.includes(source.id)} key={source.id} value={source.id}>{source.displayName}{enabledSourceIds.includes(source.id) ? "" : " (disabled)"}</option>)}<option value="homebrew">Custom/Homebrew</option></select></label>
          <label className="form-field"><span>Level</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, level: event.target.value }))} value={catalogFilters.level}><option value="all">All levels</option>{Array.from({ length: 10 }, (_, level) => <option key={level} value={level}>{levelLabel(level)}</option>)}</select></label>
          <label className="form-field"><span>School</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, school: event.target.value }))} value={catalogFilters.school}><option value="all">All schools</option>{spellCatalogMetadata.schools.map((school) => <option key={school}>{school}</option>)}</select></label>
          <label className="form-field"><span>Action type</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, actionType: event.target.value }))} value={catalogFilters.actionType}><option value="all">All action types</option>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-field"><span>Concentration</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, concentration: event.target.value }))} value={catalogFilters.concentration}><option value="all">Either</option><option value="yes">Concentration</option><option value="no">No concentration</option></select></label>
          <label className="form-field"><span>Ritual</span><select onChange={(event) => setCatalogFilters((current) => ({ ...current, ritual: event.target.value }))} value={catalogFilters.ritual}><option value="all">Either</option><option value="yes">Ritual</option><option value="no">Not ritual</option></select></label>
          <button className="secondary-button compact clear-spell-filters" onClick={() => setCatalogFilters(emptyFilters)} type="button">Clear filters</button>
        </div>
        {showCustomSpell && <form className="custom-spell-form" onSubmit={(event) => void createCustom(event)}>
          <div><strong>Create Custom Spell</strong><p>Use this only for homebrew or spells not included in the catalog. It starts with blank editable data.</p></div>
          <div className="quick-add-row spell-add-row"><label className="sr-only" htmlFor={`custom-spell-${characterId}`}>Custom spell name</label><input id={`custom-spell-${characterId}`} maxLength={200} onChange={(event) => setCustomSpellName(event.target.value)} placeholder="Custom spell name..." value={customSpellName} /><button className="primary-button" disabled={!customSpellName.trim()} type="submit">Create Custom Spell</button></div>
          {exactCustomMatch?.definitionStatus === "complete" && <p className="inline-message">{exactCustomMatch.name} already has a complete catalog definition. Add the structured catalog spell instead.</p>}
          {exactCustomMatch?.definitionStatus === "unavailable" && <p className="inline-message">The guide lists this spell without complete rules. Creating a custom draft is allowed, but it remains non-castable until the required fields and description are completed.</p>}
          {exactCustomMatch?.definitionStatus !== "complete" && customSuggestions.length > 0 && <div className="custom-spell-suggestions"><strong>Catalog matches to check first</strong>{customSuggestions.map((suggestion) => <button className="text-button" key={suggestion.id} onClick={() => { setCatalogFilters((current) => ({ ...current, query: suggestion.name })); setShowCustomSpell(false); }} type="button">{suggestion.name} · {levelLabel(suggestion.level)} {suggestion.school}</button>)}</div>}
        </form>}
        {message && <p className="inline-message inventory-message" role="status">{message}</p>}
        <div className="catalog-results" aria-label="Available catalog spells">
          {catalogResults.length ? catalogResults.map((definition) => <CatalogSpellCard enabledSourceIds={enabledSourceIds} key={definition.id} onOpen={() => openCatalogSpell(definition)} owned={ownedDefinitionIds.has(definition.id)} spell={definition} />) : <div className="spell-empty"><strong>No catalog spells match</strong><span>Clear or adjust the catalog filters, or enable the optional source in Settings.</span></div>}
        </div>
        {catalogMatches.length > catalogResults.length && <p className="catalog-limit-note">Showing the first {catalogResults.length} of {catalogMatches.length} matches. Refine your search to narrow the catalog.</p>}
      </article>

      <article className="panel spellbook-library">
        <div className="form-section-heading"><div><span className="card-label">Spells already owned by this character</span><h2>Character spells</h2><p>{spells.length} {spells.length === 1 ? "spell" : "spells"} stored locally for this character.</p></div></div>
        {message && <p className="inline-message inventory-message" role="status">{message}</p>}

        <div className="spell-filters">
          <label className="form-field spell-search"><span>Search</span><input onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Name, description, conditions..." type="search" value={filters.query} /></label>
          <label className="form-field"><span>Level</span><select onChange={(event) => setFilters((current) => ({ ...current, level: event.target.value }))} value={filters.level}><option value="all">All levels</option>{Array.from({ length: 10 }, (_, level) => <option key={level} value={level}>{levelLabel(level)}</option>)}</select></label>
          <label className="form-field"><span>School</span><select onChange={(event) => setFilters((current) => ({ ...current, school: event.target.value }))} value={filters.school}><option value="all">All schools</option>{schools.map((school) => <option key={school}>{school}</option>)}</select></label>
          <label className="form-field"><span>Action type</span><select onChange={(event) => setFilters((current) => ({ ...current, actionType: event.target.value }))} value={filters.actionType}><option value="all">All action types</option>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-field"><span>Source</span><select onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))} value={filters.source}><option value="all">All sources</option><option value={SRD_CONTENT_SOURCE_ID}>SRD 5.2.1</option><option value={FFXIV_CONTENT_SOURCE_ID}>Final Fantasy Companion Guide</option><option value="homebrew">Custom/Homebrew</option></select></label>
          <label className="form-field"><span>Damage type</span><select onChange={(event) => setFilters((current) => ({ ...current, damageType: event.target.value }))} value={filters.damageType}><option value="all">All damage types</option>{damageTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="form-field"><span>Concentration</span><select onChange={(event) => setFilters((current) => ({ ...current, concentration: event.target.value }))} value={filters.concentration}><option value="all">Either</option><option value="yes">Concentration</option><option value="no">No concentration</option></select></label>
          <label className="form-field"><span>Ritual</span><select onChange={(event) => setFilters((current) => ({ ...current, ritual: event.target.value }))} value={filters.ritual}><option value="all">Either</option><option value="yes">Ritual</option><option value="no">Not ritual</option></select></label>
          <label className="form-field"><span>Pinned</span><select onChange={(event) => setFilters((current) => ({ ...current, pinned: event.target.value }))} value={filters.pinned}><option value="all">All spells</option><option value="yes">Pinned only</option><option value="no">Unpinned only</option></select></label>
          <label className="form-field"><span>Sort by</span><select onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))} value={filters.sort}><option value="level">Level then name</option><option value="name">Name</option><option value="recent">Recently edited</option></select></label>
          <button className="secondary-button compact clear-spell-filters" onClick={() => setFilters(emptyFilters)} type="button">Clear filters</button>
        </div>

        <div className="spell-list">
          {visibleSpells.length ? visibleSpells.map((spell) => {
            const repairDefinition = spell.homebrew && !spell.definitionId ? findCatalogSpellByName(spell.name) : undefined;
            return <div className="spell-list-row" key={spell.id}><SpellCard onOpen={() => setSelectedSpellId(spell.id)} onPin={() => void setSpellPinned(characterId, spell.id, !pinnedIds.includes(spell.id))} pinned={pinnedIds.includes(spell.id)} spell={spell} /><div className="spell-list-actions">{repairDefinition?.definitionStatus === "complete" && <button className="text-button" onClick={() => void repairSpell(spell, repairDefinition)} type="button">Replace with <SourceBadge source={repairDefinition.rulesSourceId} /> spell data</button>}<button className="text-button" onClick={() => void duplicateSpell(characterId, spell.id).then((copy) => setSelectedSpellId(copy.id))} type="button">Duplicate</button><button className="text-button danger" onClick={() => void remove(spell)} type="button">Delete</button></div></div>;
          }) : <div className="spell-empty"><strong>{spells.length ? "No spells match these filters" : "This spellbook is empty"}</strong><span>{spells.length ? "Clear or adjust filters to see more spells." : "Add a spell from the catalog or create a custom spell."}</span></div>}
        </div>
      </article>
    </section>
  );
}
