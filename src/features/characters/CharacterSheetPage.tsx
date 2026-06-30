import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { AbilityId, CharacterSheet, SkillId } from "../../domain/models";
import { abilityModifier, formatModifier, proficiencyBonusForLevel, skillAbilities, skillModifier } from "../../domain/dndMath";
import { DiceRoller } from "../../components/DiceRoller";
import { abilityIds, getOrCreateCharacterSheet, saveCharacterSheet, skillIds } from "../../storage/characterSheets";
import { db } from "../../storage/database";
import { InventorySection } from "./InventorySection";
import { SoulReaperSection } from "./SoulReaperSection";
import { levelUpPreview } from "../../rules/levelUp";
import { changeUsedSpellSlots, remainingSpellSlots, resetUsedSpellSlots, shouldConfirmLongRest } from "../../rules/spellSlots";
import { rollFormula } from "../../dice/dice";
import { applyDamage, applyHealing } from "../../rules/hitPoints";
import { buildRollAssistantRows, type RollAssistantMode } from "../../rules/rollAssistant";
import { createCharacterBackup, downloadBackup } from "../../storage/backups";
import {
  defaultSheetLayoutOrder,
  isSheetLayoutSectionId,
  livePlayShortcutSections,
  moveSheetLayoutSection,
  normalizeSheetLayoutOrder,
  reorderSheetLayoutOrder,
  sheetSectionDomId,
  type SheetLayoutPlacement,
  type SheetLayoutSectionId,
} from "./sheetLayout";

const abilityLabels: Record<AbilityId, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
};

const abilityFullLabels: Record<AbilityId, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

const skillLabels: Record<SkillId, string> = {
  acrobatics: "Acrobatics", animalHandling: "Animal Handling", arcana: "Arcana",
  athletics: "Athletics", deception: "Deception", history: "History", insight: "Insight",
  intimidation: "Intimidation", investigation: "Investigation", medicine: "Medicine",
  nature: "Nature", perception: "Perception", performance: "Performance", persuasion: "Persuasion",
  religion: "Religion", sleightOfHand: "Sleight of Hand", stealth: "Stealth", survival: "Survival",
};

const layoutSectionTitles: Record<SheetLayoutSectionId, string> = {
  dice: "Dice",
  "roll-helper": "What Do I Roll?",
  identity: "Character identity",
  "level-preview": "Next level preview",
  roleplay: "Biography",
  "health-combat": "Health and combat",
  abilities: "Ability scores",
  proficiencies: "Saving throws and skills",
  attacks: "Attacks and damage",
  training: "Proficiencies and languages",
  spells: "Spells",
  features: "Features and traits",
  notes: "Character notes",
  "soul-reaper": "Soul Reaper",
  inventory: "Inventory",
};

function LevelUpHint() {
  return <small className="level-up-hint">Usually changed during level up.</small>;
}

type LayoutCardProps = {
  children: ReactNode;
  customizeMode: boolean;
  dragging: boolean;
  id: SheetLayoutSectionId;
  index: number;
  style?: CSSProperties;
  title: string;
  total: number;
  onDragEnd: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragStart: (id: SheetLayoutSectionId, event: PointerEvent<HTMLButtonElement>) => void;
  onMove: (id: SheetLayoutSectionId, direction: "up" | "down") => void;
};

function LayoutCard({ children, customizeMode, dragging, id, index, style, title, total, onDragEnd, onDragMove, onDragStart, onMove }: LayoutCardProps) {
  return (
    <div className={customizeMode ? `layout-card customizing${dragging ? " dragging" : ""}` : "layout-card"} data-layout-card-id={id} data-sheet-section-id={id} id={sheetSectionDomId(id)} style={style} tabIndex={-1}>
      {customizeMode && (
        <div className="layout-card-controls">
          <button
            aria-label={`Drag ${title}`}
            aria-pressed={dragging}
            className="layout-drag-handle"
            onPointerCancel={onDragEnd}
            onPointerDown={(event) => onDragStart(id, event)}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            type="button"
          >
            <span aria-hidden="true">::</span>
            <strong>{title}</strong>
          </button>
          <div className="layout-move-buttons">
            <button className="secondary-button compact" disabled={index === 0} onClick={() => onMove(id, "up")} type="button">Move up</button>
            <button className="secondary-button compact" disabled={index === total - 1} onClick={() => onMove(id, "down")} type="button">Move down</button>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export function CharacterSheetPage({ characterId }: { characterId: string }) {
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const [sheet, setSheet] = useState<CharacterSheet | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("Saved locally");
  const [damageAmount, setDamageAmount] = useState(1);
  const [healingAmount, setHealingAmount] = useState(1);
  const [hpPreview, setHpPreview] = useState("");
  const [quickRoll, setQuickRoll] = useState("");
  const [rollMode, setRollMode] = useState<RollAssistantMode>(() => localStorage.getItem("vault:roll-mode") === "veteran" ? "veteran" : "beginner");
  const [customizeLayout, setCustomizeLayout] = useState(false);
  const [draggingSectionId, setDraggingSectionId] = useState<SheetLayoutSectionId | null>(null);
  const draggingSectionRef = useRef<SheetLayoutSectionId | null>(null);
  const editVersion = useRef(0);

  useEffect(() => {
    let active = true;
    void getOrCreateCharacterSheet(characterId)
      .then((loaded) => { if (active) setSheet(loaded); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? `${error.name}: ${error.message}` : String(error)); });
    return () => { active = false; };
  }, [characterId]);

  useEffect(() => {
    if (!sheet || status !== "Unsaved changes") return;
    const timer = window.setTimeout(async () => {
      const version = editVersion.current;
      setStatus("Saving locally...");
      try {
        const saved = await saveCharacterSheet(sheet);
        if (editVersion.current === version) {
          setSheet(saved);
          setStatus("Saved locally");
        } else {
          setStatus("Unsaved changes");
        }
      } catch {
        setStatus("Could not save");
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [sheet, status]);

  useEffect(() => {
    const flush = () => {
      if (!sheet || status !== "Unsaved changes") return;
      void saveCharacterSheet(sheet).then((saved) => {
        setSheet(saved);
        setStatus("Saved locally");
      });
    };
    window.addEventListener("vault:flush", flush);
    return () => window.removeEventListener("vault:flush", flush);
  }, [sheet, status]);

  const edit = (change: (current: CharacterSheet) => CharacterSheet) => {
    editVersion.current += 1;
    setSheet((current) => current ? change(current) : current);
    setStatus("Unsaved changes");
  };

  const changeHp = async (mode: "damage" | "healing", amount: number) => {
    if (!sheet) return;
    const before = `${sheet.currentHp}/${sheet.maxHp} HP, ${sheet.temporaryHp} temp`;
    const next = mode === "damage" ? applyDamage(sheet, amount) : applyHealing(sheet, amount);
    const after = `${next.currentHp}/${next.maxHp} HP, ${next.temporaryHp} temp`;

    setStatus("Saving locally...");
    const updated = await saveCharacterSheet({ ...sheet, currentHp: next.currentHp, temporaryHp: next.temporaryHp });
    setSheet(updated);
    setHpPreview(`${mode === "damage" ? "Damage" : "Healing"} applied: ${before} → ${after}${next.absorbedByTemporaryHp ? ` (${next.absorbedByTemporaryHp} absorbed by temporary HP)` : ""}`);
    setStatus("Saved locally");
  };

  const exportCharacter = async () => {
    setStatus("Preparing character backup...");
    try {
      const created = await createCharacterBackup(characterId);
      const result = await downloadBackup(created, "character");
      const action = result.deliveryMethod === "shared" ? "shared" : result.deliveryMethod === "opened" ? "opened in a new tab" : "download started";
      setStatus(`Character export ${action}: ${result.fileName} · ${result.fileSizeLabel} · ${result.timeLabel}`);
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === "AbortError" ? "Export canceled. No character backup was shared or downloaded." : error instanceof Error ? error.message : "Could not export character");
    }
  };

  const updateCharacterField = async (changes: Record<string, string | number>) => {
    await db.characters.update(characterId, { ...changes, updatedAt: new Date().toISOString() });
  };

  const rollNow = (label: string, formula: string) => {
    try {
      const result = rollFormula(formula);
      setQuickRoll(`${label}: ${result.breakdown}`);
    } catch (error) {
      setQuickRoll(error instanceof Error ? error.message : "Could not roll");
    }
  };

  const changeSlotUse = (level: string, change: number) => edit((current) => ({
    ...current,
    spellSlotsUsed: {
      ...current.spellSlotsUsed,
      [level]: changeUsedSpellSlots(current.spellSlots[level] ?? 0, current.spellSlotsUsed[level] ?? 0, change),
    },
  }));

  const longRest = () => {
    if (!sheet) return;
    const hasUsedSlots = Object.values(sheet.spellSlotsUsed).some((used) => used > 0);
    if (!shouldConfirmLongRest(hasUsedSlots, (message) => window.confirm(message))) return;
    edit((current) => ({ ...current, spellSlotsUsed: resetUsedSpellSlots(current.spellSlotsUsed) }));
    setQuickRoll("Long Rest: used spell slots reset.");
  };

  const shortRest = () => {
    setQuickRoll("Short Rest noted. No spell slots were reset automatically.");
  };

  const setAssistantMode = (mode: RollAssistantMode) => {
    setRollMode(mode);
    localStorage.setItem("vault:roll-mode", mode);
  };

  const scrollToSheetSection = (sectionId: SheetLayoutSectionId) => {
    const target = document.getElementById(sheetSectionDomId(sectionId));
    if (!target) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start", inline: "nearest" });
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  };

  const updateLayoutOrder = (change: (currentOrder: readonly string[]) => SheetLayoutSectionId[]) => {
    edit((current) => ({ ...current, sheetLayoutOrder: change(current.sheetLayoutOrder) }));
  };

  const moveLayoutCard = (sectionId: SheetLayoutSectionId, direction: "up" | "down") => {
    updateLayoutOrder((currentOrder) => moveSheetLayoutSection(currentOrder, sectionId, direction));
  };

  const resetLayout = () => {
    updateLayoutOrder(() => []);
    setCustomizeLayout(false);
    setDraggingSectionId(null);
    draggingSectionRef.current = null;
  };

  const startLayoutDrag = (sectionId: SheetLayoutSectionId, event: PointerEvent<HTMLButtonElement>) => {
    if (!customizeLayout) return;
    draggingSectionRef.current = sectionId;
    setDraggingSectionId(sectionId);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveLayoutDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const activeId = draggingSectionRef.current;
    if (!activeId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const targetCard = target instanceof Element ? target.closest<HTMLElement>("[data-layout-card-id]") : null;
    const targetId = targetCard?.dataset.layoutCardId;
    if (!targetId || !isSheetLayoutSectionId(targetId) || targetId === activeId) return;

    const targetRect = targetCard.getBoundingClientRect();
    const placement: SheetLayoutPlacement = event.clientY > targetRect.top + targetRect.height / 2 ? "after" : "before";
    updateLayoutOrder((currentOrder) => reorderSheetLayoutOrder(currentOrder, activeId, targetId, placement));
  };

  const endLayoutDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    draggingSectionRef.current = null;
    setDraggingSectionId(null);
  };

  if (loadError) return <section className="page"><div className="loading-state">Could not open character sheet: {loadError}</div></section>;
  if (!character || !sheet) return <section className="page"><div className="loading-state">Opening character sheet...</div></section>;
  const levelPreview = levelUpPreview(character.level);
  const rollRows = buildRollAssistantRows(sheet);
  const initiativeRow = rollRows.find((row) => row.id === "initiative");
  const layoutOrder = normalizeSheetLayoutOrder(sheet.sheetLayoutOrder);
  const passivePerception = 10 + skillModifier(sheet, "perception");
  const hpMaximum = Math.max(sheet.maxHp, 1);
  const hpPercent = Math.max(0, Math.min(100, Math.round((sheet.currentHp / hpMaximum) * 100)));
  const characterSubtitle = [
    character.ancestry,
    character.characterClass,
    `Level ${character.level}`,
  ].filter(Boolean).join(" / ");

  const layoutProps = (id: SheetLayoutSectionId) => ({
    customizeMode: customizeLayout,
    dragging: draggingSectionId === id,
    id,
    index: layoutOrder.indexOf(id),
    onDragEnd: endLayoutDrag,
    onDragMove: moveLayoutDrag,
    onDragStart: startLayoutDrag,
    onMove: moveLayoutCard,
    style: { order: layoutOrder.indexOf(id) },
    title: layoutSectionTitles[id],
    total: defaultSheetLayoutOrder.length,
  });

  return (
    <section className={customizeLayout ? "page sheet-page layout-editing" : "page sheet-page"}>
      <header className="sheet-character-header" aria-labelledby="sheet-character-title">
        <div className="sheet-character-title-block">
          <span className="eyebrow">Play tools</span>
          <h1 id="sheet-character-title">{character.name}</h1>
          <p>{characterSubtitle || "Touch-friendly live play sheet"}</p>
        </div>
        <div className="sheet-header-panel">
          <div className="sheet-header-meta">
            <span>{character.campaign || "No campaign set"}</span>
            <strong>{status}</strong>
          </div>
          <div className="header-action-group">
            {customizeLayout && <button className="secondary-button" onClick={resetLayout} type="button">Reset Layout</button>}
            <button className={customizeLayout ? "primary-button" : "secondary-button"} data-testid="customize-layout-button" onClick={() => setCustomizeLayout((current) => !current)} type="button">{customizeLayout ? "Done" : "Customize Layout"}</button>
            <a className="primary-button button-link" href={`#spellbook/${characterId}`}>Spellbook</a>
            <button className="secondary-button" onClick={() => void exportCharacter()} type="button">Export Character</button>
            <a className="secondary-button button-link" href={`#character/${characterId}`}>Profile</a>
            <a className="secondary-button button-link" href="#characters">Characters</a>
          </div>
        </div>
      </header>

      <section className="combat-summary-region" aria-label="Combat summary">
        <button className="combat-summary-card" onClick={() => scrollToSheetSection("health-combat")} type="button">
          <span>Armor Class</span>
          <strong>{sheet.armorClass}</strong>
          <small>Defense</small>
        </button>
        <button className="combat-summary-card" onClick={() => initiativeRow ? rollNow("Initiative", initiativeRow.formula) : scrollToSheetSection("health-combat")} type="button">
          <span>Initiative</span>
          <strong>{formatModifier(sheet.initiative)}</strong>
          <small>{initiativeRow ? "Tap to roll" : "Edit in combat"}</small>
        </button>
        <button className="combat-summary-card hp-summary-card" onClick={() => scrollToSheetSection("health-combat")} type="button">
          <span>Hit Points</span>
          <strong>{sheet.currentHp}/{sheet.maxHp}</strong>
          <small>{sheet.temporaryHp} temporary</small>
          <i aria-hidden="true"><b style={{ width: `${hpPercent}%` }} /></i>
        </button>
        <button className="combat-summary-card" onClick={() => scrollToSheetSection("notes")} type="button">
          <span>Conditions</span>
          <strong>{sheet.notes.trim() ? "Notes" : "Clear"}</strong>
          <small>Jump to play notes</small>
        </button>
      </section>

      <section className="abilities-senses-region" aria-labelledby="abilities-senses-title">
        <div className="sheet-region-heading">
          <div>
            <span className="card-label">Abilities, saves, senses</span>
            <h2 id="abilities-senses-title">At-a-glance checks</h2>
          </div>
          <button className="secondary-button compact" onClick={() => scrollToSheetSection("abilities")} type="button">Edit scores</button>
        </div>
        <div className="ability-score-dashboard">
          {abilityIds.map((ability) => (
            <button className="ability-score-chip" key={ability} onClick={() => rollNow(`${abilityLabels[ability]} check`, `d20${formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10))}`)} type="button">
              <span>{abilityFullLabels[ability]}</span>
              <strong>{formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10))}</strong>
              <small>{sheet.abilityScores[ability] ?? 10}</small>
            </button>
          ))}
          <button className="sense-chip" onClick={() => scrollToSheetSection("proficiencies")} type="button">
            <span>Passive Perception</span>
            <strong>{passivePerception}</strong>
          </button>
          <button className="sense-chip" onClick={() => scrollToSheetSection("health-combat")} type="button">
            <span>Speed</span>
            <strong>{sheet.speed}</strong>
          </button>
          <button className="sense-chip" onClick={() => scrollToSheetSection("proficiencies")} type="button">
            <span>Proficiency</span>
            <strong>{formatModifier(sheet.proficiencyBonus)}</strong>
          </button>
        </div>
      </section>

      {quickRoll && <p className="panel inline-message tool-status" role="status">{quickRoll}</p>}

      <nav aria-label="Live play shortcuts" className="play-jump-bar">
        {livePlayShortcutSections.map((section) => (
          <button data-shortcut-target={section.targetId} key={section.id} onClick={() => scrollToSheetSection(section.id)} type="button">{section.label}</button>
        ))}
        <a href={`#spellbook/${characterId}`}>Book</a>
        <button className={customizeLayout ? "play-jump-action active" : "play-jump-action"} onClick={() => setCustomizeLayout((current) => !current)} type="button">{customizeLayout ? "Done" : "Layout"}</button>
      </nav>

      {customizeLayout && <div className="layout-customize-bar">
        <div>
          <span className="card-label">Editing layout</span>
          <h2>Reorder this character's play sheet</h2>
          <p>Drag section handles on touch or mouse. Move up and Move down stay available for precise control. Tap Done when finished.</p>
        </div>
        <div className="layout-customize-actions">
          <button className="secondary-button compact" onClick={resetLayout} type="button">Reset Layout</button>
          <button className="primary-button compact" onClick={() => setCustomizeLayout(false)} type="button">Done</button>
        </div>
      </div>}

      <div className={customizeLayout ? "sheet-layout-stack customizing" : "sheet-layout-stack"} aria-label="Gameplay modules">
      <LayoutCard {...layoutProps("dice")}>
      <article className="panel sheet-section dice-tools-panel">
        <div className="form-section-heading"><div><span className="card-label">Optional rolling</span><h2>Dice</h2><p>Roll here when useful, or keep using physical dice.</p></div></div>
        <DiceRoller compact context="Local only. Results are not sent anywhere." label="Table dice" />
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("roll-helper")}>
      <article className="panel sheet-section roll-assistant-panel">
        <div className="form-section-heading">
          <div><span className="card-label">Live play helper</span><h2>What Do I Roll?</h2><p>Character-specific shortcuts based on this sheet's saved bonuses and proficiencies.</p></div>
          <div className="mode-toggle">
            <button className={rollMode === "beginner" ? "secondary-button compact active" : "secondary-button compact"} onClick={() => setAssistantMode("beginner")} type="button">Beginner</button>
            <button className={rollMode === "veteran" ? "secondary-button compact active" : "secondary-button compact"} onClick={() => setAssistantMode("veteran")} type="button">Veteran</button>
          </div>
        </div>
        <div className="roll-assistant-grid">
          {rollRows.map((row) => <article className="roll-assistant-card" key={row.id}>
            <div><strong>{row.label}</strong><span>{row.formula}</span>{row.bonus !== null && <small>Total bonus {formatModifier(row.bonus)}</small>}</div>
            <button className="primary-button compact" onClick={() => row.rollable ? rollNow(row.label, row.formula) : setQuickRoll(`${row.label}: ${row.explanation}`)} type="button">{row.rollable ? "Roll" : "Explain"}</button>
            {rollMode === "beginner" && <p>{row.explanation}</p>}
          </article>)}
        </div>
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("identity")}>
      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Overview</span><h2>Character identity</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Name</span><input maxLength={100} onChange={(event) => void updateCharacterField({ name: event.target.value })} value={character.name} /></label>
          <label className="form-field"><span>Player name</span><input maxLength={100} onChange={(event) => void updateCharacterField({ playerName: event.target.value })} value={character.playerName} /></label>
          <label className="form-field"><span>Campaign</span><input maxLength={100} onChange={(event) => void updateCharacterField({ campaign: event.target.value })} value={character.campaign} /></label>
          <label className="form-field level-up-field"><span>Level <LevelUpHint /></span><input max={20} min={1} onChange={(event) => void updateCharacterField({ level: Number(event.target.value) }).then(() => edit((current) => ({ ...current, proficiencyBonus: proficiencyBonusForLevel(Number(event.target.value)) })))} type="number" value={character.level} /></label>
          <label className="form-field"><span>Class</span><input maxLength={100} onChange={(event) => void updateCharacterField({ characterClass: event.target.value })} value={character.characterClass} /></label>
          <label className="form-field"><span>Species / Ancestry</span><input maxLength={100} onChange={(event) => void updateCharacterField({ ancestry: event.target.value })} value={character.ancestry} /></label>
          <label className="form-field full-width"><span>Background / Origin</span><input maxLength={100} onChange={(event) => void updateCharacterField({ background: event.target.value })} value={character.background} /></label>
          <label className="form-field full-width"><span>Short concept</span><input maxLength={500} onChange={(event) => void updateCharacterField({ concept: event.target.value })} value={character.concept} /></label>
        </div>
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("level-preview")}>
      <article className="panel sheet-section level-up-preview">
        <div className="form-section-heading">
          <div>
            <span className="card-label">Level up foundation</span>
            <h2>Next level preview</h2>
            <p>This is a reminder panel only. It does not change your character automatically.</p>
          </div>
          <span className="status-badge">Manual control</span>
        </div>
        <div className="level-up-grid">
          <div><small>Current level</small><strong>{levelPreview.currentLevel}</strong></div>
          <div><small>Next level</small><strong>{levelPreview.nextLevel ?? "Max"}</strong></div>
          <div><small>Proficiency now</small><strong>{formatModifier(levelPreview.currentProficiencyBonus)}</strong></div>
          <div><small>Proficiency next</small><strong>{formatModifier(levelPreview.nextProficiencyBonus)}</strong></div>
        </div>
        {levelPreview.proficiencyChanges && <p className="inline-message">At level {levelPreview.nextLevel}, proficiency bonus changes to <strong>{formatModifier(levelPreview.nextProficiencyBonus)}</strong>.</p>}
        <div className="level-up-field-list">
          {levelPreview.fields.map((field) => <span key={field}>{field} <LevelUpHint /></span>)}
        </div>
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("roleplay")}>
      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Biography</span><h2>Biography and roleplay</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Personality notes</span><textarea onChange={(event) => void updateCharacterField({ personalityNotes: event.target.value })} rows={5} value={character.personalityNotes} /></label>
          <label className="form-field"><span>Goals</span><textarea onChange={(event) => void updateCharacterField({ goals: event.target.value })} rows={5} value={character.goals} /></label>
          <label className="form-field"><span>Important relationships</span><textarea onChange={(event) => void updateCharacterField({ importantRelationships: event.target.value })} rows={5} value={character.importantRelationships} /></label>
          <label className="form-field"><span>Roleplay notes</span><textarea onChange={(event) => void updateCharacterField({ roleplayNotes: event.target.value })} rows={5} value={character.roleplayNotes} /></label>
          <label className="form-field full-width"><span>Backstory</span><textarea onChange={(event) => void updateCharacterField({ backstory: event.target.value, summary: event.target.value.slice(0, 20000) })} rows={8} value={character.backstory} /></label>
        </div>
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("health-combat")}>
      <div className="play-grid">
        <article className="panel hp-panel">
          <div className="form-section-heading"><div><span className="card-label">Hit points</span><h2>Health</h2></div></div>
          <div className="hp-values">
            <label className="stat-field"><span>Current</span><input min={0} onChange={(event) => edit((current) => ({ ...current, currentHp: Number(event.target.value) }))} type="number" value={sheet.currentHp} /></label>
            <span className="hp-divider">/</span>
            <label className="stat-field level-up-field"><span>Maximum <LevelUpHint /></span><input min={0} onChange={(event) => edit((current) => ({ ...current, maxHp: Number(event.target.value) }))} type="number" value={sheet.maxHp} /></label>
            <label className="stat-field temp-hp"><span>Temporary</span><input min={0} onChange={(event) => edit((current) => ({ ...current, temporaryHp: Number(event.target.value) }))} type="number" value={sheet.temporaryHp} /></label>
          </div>
          <div className="hp-controls">
            <div className="hp-before-after">
              <strong>Before</strong><span>{sheet.currentHp}/{sheet.maxHp} HP · {sheet.temporaryHp} temp</span>
              {hpPreview && <><strong>Last change</strong><span>{hpPreview}</span></>}
            </div>
            <div className="hp-entry-grid">
              <label className="form-field"><span>Damage input</span><input min={0} onChange={(event) => setDamageAmount(Number(event.target.value))} type="number" value={damageAmount} /></label>
              <label className="form-field"><span>Healing input</span><input min={0} onChange={(event) => setHealingAmount(Number(event.target.value))} type="number" value={healingAmount} /></label>
            </div>
            <div className="hp-action-buttons">
              <button className="touch-button damage-button" onClick={() => void changeHp("damage", damageAmount)} type="button">Apply Damage</button>
              <button className="touch-button healing-button" onClick={() => void changeHp("healing", healingAmount)} type="button">Apply Healing</button>
            </div>
            <div className="hp-quick-deltas" aria-label="Quick HP changes">
              {[-1, -5, -10].map((amount) => <button className="quick-value damage-quick" key={amount} onClick={() => void changeHp("damage", Math.abs(amount))} type="button">{amount}</button>)}
              {[1, 5, 10].map((amount) => <button className="quick-value healing-quick" key={amount} onClick={() => void changeHp("healing", amount)} type="button">+{amount}</button>)}
            </div>
          </div>
        </article>

        <article className="panel combat-panel">
          <div className="form-section-heading"><div><span className="card-label">Combat</span><h2>Defenses and movement</h2></div></div>
          <div className="combat-stats">
            <label className="big-stat"><span>Armor Class</span><input min={0} onChange={(event) => edit((current) => ({ ...current, armorClass: Number(event.target.value) }))} type="number" value={sheet.armorClass} /></label>
            <label className="big-stat"><span>Initiative</span><input onChange={(event) => edit((current) => ({ ...current, initiative: Number(event.target.value) }))} type="number" value={sheet.initiative} /></label>
            <label className="big-stat"><span>Speed</span><input min={0} onChange={(event) => edit((current) => ({ ...current, speed: Number(event.target.value) }))} type="number" value={sheet.speed} /></label>
          </div>
          <div className="form-grid combat-extra-grid">
            <label className="form-field level-up-field"><span>Hit Dice <LevelUpHint /></span><input onChange={(event) => edit((current) => ({ ...current, hitDice: event.target.value }))} value={sheet.hitDice} /></label>
            <label className="form-field"><span>Death save successes</span><input max={3} min={0} onChange={(event) => edit((current) => ({ ...current, deathSaveSuccesses: Number(event.target.value) }))} type="number" value={sheet.deathSaveSuccesses} /></label>
            <label className="form-field"><span>Death save failures</span><input max={3} min={0} onChange={(event) => edit((current) => ({ ...current, deathSaveFailures: Number(event.target.value) }))} type="number" value={sheet.deathSaveFailures} /></label>
            <button className="secondary-button compact" disabled={!initiativeRow} onClick={() => initiativeRow && rollNow("Initiative", initiativeRow.formula)} type="button">Roll initiative</button>
            <button className="secondary-button compact" disabled={!sheet.hitDice.trim()} onClick={() => rollNow("Hit Dice", sheet.hitDice)} type="button">Roll hit dice</button>
            <button className="secondary-button compact" onClick={() => scrollToSheetSection("notes")} type="button">Conditions / notes</button>
          </div>
        </article>
      </div>
      </LayoutCard>

      <LayoutCard {...layoutProps("abilities")}>
      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Core abilities</span><h2>Ability scores</h2><p>These remain editable, but are normally adjusted during level-up choices.</p></div></div>
        <div className="ability-grid">
          {abilityIds.map((ability) => (
            <label className="ability-card" key={ability}>
              <span>{abilityLabels[ability]}</span>
              <strong>{formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10))}</strong>
              <input min={1} max={30} onChange={(event) => edit((current) => ({ ...current, abilityScores: { ...current.abilityScores, [ability]: Number(event.target.value) } }))} type="number" value={sheet.abilityScores[ability] ?? 10} />
              <button className="secondary-button compact" onClick={() => rollNow(`${abilityLabels[ability]} check`, `d20${formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10))}`)} type="button">Roll</button>
              <LevelUpHint />
            </label>
          ))}
        </div>
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("proficiencies")}>
      <div className="proficiency-grid">
        <article className="panel sheet-section">
          <div className="form-section-heading"><div><span className="card-label">Proficiencies</span><h2>Saving throws</h2><p>Proficiency bonus: <strong>{formatModifier(sheet.proficiencyBonus)}</strong> <span className="level-up-hint">Usually changed during level up.</span></p></div><label className="form-field compact-field"><span>Override</span><input min={2} max={6} onChange={(event) => edit((current) => ({ ...current, proficiencyBonus: Number(event.target.value) }))} type="number" value={sheet.proficiencyBonus} /></label></div>
          <div className="check-list">
            {abilityIds.map((ability) => {
              const saveModifier = abilityModifier(sheet.abilityScores[ability] ?? 10) + (sheet.savingThrows[ability] ? sheet.proficiencyBonus : 0);
              return <label className="proficiency-row" key={ability}><input checked={sheet.savingThrows[ability] ?? false} onChange={(event) => edit((current) => ({ ...current, savingThrows: { ...current.savingThrows, [ability]: event.target.checked } }))} type="checkbox" /><span>{abilityLabels[ability]}</span><small>{formatModifier(saveModifier)}</small><button className="secondary-button compact" onClick={() => rollNow(`${abilityLabels[ability]} save`, `d20${formatModifier(saveModifier)}`)} type="button">Roll</button></label>;
            })}
          </div>
        </article>
        <article className="panel sheet-section">
          <div className="form-section-heading"><div><span className="card-label">Proficiencies</span><h2>Skills</h2></div></div>
          <div className="check-list skills-list">
            {skillIds.map((skill) => <label className="proficiency-row" key={skill}><input checked={sheet.skillProficiencies[skill] ?? false} onChange={(event) => edit((current) => ({ ...current, skillProficiencies: { ...current.skillProficiencies, [skill]: event.target.checked } }))} type="checkbox" /><span>{skillLabels[skill]}</span><small>{abilityLabels[skillAbilities[skill]]} {formatModifier(skillModifier(sheet, skill))}</small></label>)}
          </div>
        </article>
      </div>
      </LayoutCard>

      <LayoutCard {...layoutProps("attacks")}>
      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Combat</span><h2>Attacks, weapons, and damage</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Attacks</span><textarea onChange={(event) => edit((current) => ({ ...current, attacks: event.target.value }))} rows={5} value={sheet.attacks} /></label>
          <label className="form-field"><span>Weapons</span><textarea onChange={(event) => edit((current) => ({ ...current, weapons: event.target.value }))} rows={5} value={sheet.weapons} /></label>
          <label className="form-field full-width"><span>Damage notes</span><textarea onChange={(event) => edit((current) => ({ ...current, damageNotes: event.target.value }))} rows={4} value={sheet.damageNotes} /></label>
          <div className="full-width"><DiceRoller compact context="Use this for attack or damage formulas from your notes." initialFormula="d20" label="Attack roller" /></div>
        </div>
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("training")}>
      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Training</span><h2>Proficiencies & Languages</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Armor proficiencies</span><textarea onChange={(event) => edit((current) => ({ ...current, armorProficiencies: event.target.value }))} rows={4} value={sheet.armorProficiencies} /></label>
          <label className="form-field"><span>Weapon proficiencies</span><textarea onChange={(event) => edit((current) => ({ ...current, weaponProficiencies: event.target.value }))} rows={4} value={sheet.weaponProficiencies} /></label>
          <label className="form-field"><span>Tool proficiencies</span><textarea onChange={(event) => edit((current) => ({ ...current, toolProficiencies: event.target.value }))} rows={4} value={sheet.toolProficiencies} /></label>
          <label className="form-field"><span>Languages</span><textarea onChange={(event) => edit((current) => ({ ...current, languages: event.target.value }))} rows={4} value={sheet.languages} /></label>
        </div>
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("spells")}>
      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Magic</span><h2>Spells</h2><p>Use this quick section for casting stats and prepared notes, or open the full spellbook.</p></div><div className="header-action-group"><button className="secondary-button" onClick={shortRest} type="button">Short Rest</button><button className="primary-button" onClick={longRest} type="button">Long Rest</button><a className="secondary-button button-link" href={`#spellbook/${characterId}`}>Full spellbook</a></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Spellcasting ability</span><select onChange={(event) => edit((current) => ({ ...current, spellcastingAbility: event.target.value ? event.target.value as AbilityId : null }))} value={sheet.spellcastingAbility ?? ""}><option value="">None / not set</option>{abilityIds.map((ability) => <option key={ability} value={ability}>{abilityLabels[ability]}</option>)}</select></label>
          <label className="form-field"><span>Spell save DC</span><input min={0} onChange={(event) => edit((current) => ({ ...current, spellSaveDc: Number(event.target.value) }))} type="number" value={sheet.spellSaveDc} /></label>
          <label className="form-field"><span>Spell attack bonus</span><input onChange={(event) => edit((current) => ({ ...current, spellAttackBonus: Number(event.target.value) }))} type="number" value={sheet.spellAttackBonus} /></label>
          <label className="form-field level-up-field"><span>Spell slots <LevelUpHint /></span><div className="slot-grid">{Array.from({ length: 9 }, (_, index) => String(index + 1)).map((level) => <label key={level}><small>L{level}</small><input min={0} onChange={(event) => edit((current) => ({ ...current, spellSlots: { ...current.spellSlots, [level]: Number(event.target.value) } }))} type="number" value={sheet.spellSlots[level] ?? 0} /></label>)}</div></label>
          <label className="form-field"><span>Cantrips</span><textarea onChange={(event) => edit((current) => ({ ...current, cantrips: event.target.value }))} rows={5} value={sheet.cantrips} /></label>
          <label className="form-field"><span>Prepared spells</span><textarea onChange={(event) => edit((current) => ({ ...current, preparedSpells: event.target.value }))} rows={5} value={sheet.preparedSpells} /></label>
          <label className="form-field full-width"><span>Spell notes</span><textarea onChange={(event) => edit((current) => ({ ...current, spellNotes: event.target.value }))} rows={5} value={sheet.spellNotes} /></label>
        </div>
        <div className="spell-slot-tracker">
          {Array.from({ length: 9 }, (_, index) => String(index + 1)).map((level) => {
            const maximum = sheet.spellSlots[level] ?? 0;
            const used = Math.min(sheet.spellSlotsUsed[level] ?? 0, maximum);
            return <article className="slot-tracker-card" key={level}><strong>Level {level}</strong><span>Max {maximum}</span><span>Used {used}</span><span>Remaining {remainingSpellSlots(maximum, used)}</span><div className="score-button-row"><button disabled={used <= 0} onClick={() => changeSlotUse(level, -1)} type="button">-</button><button disabled={used >= maximum} onClick={() => changeSlotUse(level, 1)} type="button">+</button></div></article>;
          })}
        </div>
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("features")}>
      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Features</span><h2>Features & Traits</h2></div></div>
        <div className="form-grid">
          <label className="form-field level-up-field"><span>Class features <LevelUpHint /></span><textarea onChange={(event) => edit((current) => ({ ...current, classFeatures: event.target.value }))} rows={6} value={sheet.classFeatures} /></label>
          <label className="form-field"><span>Species traits</span><textarea onChange={(event) => edit((current) => ({ ...current, speciesTraits: event.target.value }))} rows={6} value={sheet.speciesTraits} /></label>
          <label className="form-field"><span>Background feature</span><textarea onChange={(event) => edit((current) => ({ ...current, backgroundFeature: event.target.value }))} rows={5} value={sheet.backgroundFeature} /></label>
          <label className="form-field level-up-field"><span>Feats <LevelUpHint /></span><textarea onChange={(event) => edit((current) => ({ ...current, feats: event.target.value }))} rows={5} value={sheet.feats} /></label>
          <label className="form-field full-width"><span>Special abilities</span><textarea onChange={(event) => edit((current) => ({ ...current, specialAbilities: event.target.value }))} rows={6} value={sheet.specialAbilities} /></label>
        </div>
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("notes")}>
      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">During play</span><h2>Character notes</h2></div></div>
        <label className="form-field full-width"><span>Notes</span><textarea onChange={(event) => edit((current) => ({ ...current, notes: event.target.value }))} placeholder="Conditions, reminders, NPC names, session details..." rows={12} value={sheet.notes} /></label>
      </article>
      </LayoutCard>

      <LayoutCard {...layoutProps("soul-reaper")}>
      <SoulReaperSection characterId={characterId} characterLevel={character.level} />
      </LayoutCard>
      <LayoutCard {...layoutProps("inventory")}>
      <InventorySection characterId={characterId} />
      </LayoutCard>
      </div>
    </section>
  );
}
