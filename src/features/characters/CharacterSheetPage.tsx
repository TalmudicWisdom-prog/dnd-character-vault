import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { AbilityId, CharacterSheet, SkillId } from "../../domain/models";
import { abilityModifier, formatModifier, proficiencyBonusForLevel, skillAbilities, skillModifier } from "../../domain/dndMath";
import { DiceRoller } from "../../components/DiceRoller";
import { abilityIds, getOrCreateCharacterSheet, saveCharacterSheet, skillIds } from "../../storage/characterSheets";
import { db } from "../../storage/database";
import { InventorySection } from "./InventorySection";
import { SoulReaperSection } from "./SoulReaperSection";
import { CharacterPortraitField } from "./CharacterPortraitField";
import { CharacterHud } from "./CharacterHud";
import { takeCharacterAnnouncement, takePendingSheetSection } from "../../app/activeCharacter";
import { flushPendingCharacterEdits } from "../../app/sessionRestore";
import { SpellDetailOverlay } from "../spells/SpellDetailOverlay";
import { SpellSlotTracker } from "../spells/SpellSlotTracker";
import { levelUpPreview } from "../../rules/levelUp";
import { applyRestRecovery, buildRestPreview, restLabels, type RestKind } from "../../rules/spellSlots";
import { rollFormula, type DiceRollResult } from "../../dice/dice";
import { applyDamage, applyHealing } from "../../rules/hitPoints";
import { buildRollAssistantRows, initiativeBonus, type RollAssistantMode } from "../../rules/rollAssistant";
import { createCharacterBackup, downloadBackup } from "../../storage/backups";
import {
  characterMenuIntent,
  characterMenuItems,
  characterMenuRouteHash,
  defaultSheetLayoutOrder,
  isSheetLayoutSectionId,
  moveSheetLayoutSection,
  normalizeSheetLayoutOrder,
  reorderSheetLayoutOrder,
  sheetSectionScrollBehavior,
  sheetNavigatorSections,
  sheetSectionDomId,
  type CharacterMenuItem,
  type SheetLayoutPlacement,
  type SheetLayoutSectionId,
  type SheetNavigatorSectionId,
} from "./sheetLayout";

const abilityLabels: Record<AbilityId, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
};

const abilityFullLabels: Record<AbilityId, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

const abilityLegendRows = abilityIds.map((ability) => ({
  id: ability,
  shortLabel: abilityLabels[ability],
  fullLabel: abilityFullLabels[ability],
}));

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
  attacks: "Attacks and damage",
  training: "Proficiencies and languages",
  spells: "Spells",
  features: "Features and traits",
  notes: "Character notes",
  "soul-reaper": "Soul Reaper",
  inventory: "Inventory",
};

const overlaySectionTitles: Record<SheetNavigatorSectionId, string> = {
  ...layoutSectionTitles,
  dashboard: "Dashboard",
  abilities: "Abilities, Saves, Senses",
  skills: "Skills",
  "speed-defenses": "Speed and defenses",
  book: "Book and PDF tools",
  layout: "Customize layout",
  portrait: "Edit portrait",
};

const focusableOverlaySelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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

type GameplayCardProps = {
  actions?: ReactNode;
  eyebrow: string;
  summary: ReactNode;
  title: string;
  onOpenDetails: () => void;
};

function GameplayCard({ actions, eyebrow, onOpenDetails, summary, title }: GameplayCardProps) {
  return (
    <article className="panel sheet-section gameplay-card">
      <div className="module-header">
        <div>
          <span className="card-label">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {actions && <div className="module-actions">{actions}</div>}
      </div>
      <div className="module-body">{summary}</div>
      <button className="secondary-button compact module-detail-button" onClick={onOpenDetails} type="button">Show details</button>
    </article>
  );
}

function textCount(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

type InlineRollResult = {
  id: string;
  text: string;
};

function inlineRollText(result: DiceRollResult) {
  const firstPart = result.parts[0];
  if (result.parts.length === 1 && firstPart.count === 1 && firstPart.sign === 1) {
    const roll = firstPart.rolls[0] ?? firstPart.subtotal;
    const modifierText = result.modifier ? ` ${result.modifier > 0 ? "+" : "-"} ${Math.abs(result.modifier)}` : "";
    return `${result.total} (${roll}${modifierText})`;
  }
  return `${result.total} (${result.breakdown.replace(` = ${result.total}`, "")})`;
}

function InlineRollFeedback({ result }: { result?: InlineRollResult }) {
  if (!result) return null;
  return <output aria-live="polite" className="inline-roll-result" key={result.id}>{result.text}</output>;
}

export function CharacterSheetPage({ characterId }: { characterId: string }) {
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const spells = useLiveQuery(() => db.spells.where("characterId").equals(characterId).toArray(), [characterId]) ?? [];
  const [sheet, setSheet] = useState<CharacterSheet | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("Saved locally");
  const [damageAmount, setDamageAmount] = useState(1);
  const [healingAmount, setHealingAmount] = useState(1);
  const [hpPreview, setHpPreview] = useState("");
  const [quickRoll, setQuickRoll] = useState("");
  const [inlineRolls, setInlineRolls] = useState<Record<string, InlineRollResult>>({});
  const [rollMode, setRollMode] = useState<RollAssistantMode>(() => localStorage.getItem("vault:roll-mode") === "veteran" ? "veteran" : "beginner");
  const [showAbilityLegend, setShowAbilityLegend] = useState(() => localStorage.getItem("vault:ability-legend-hidden") !== "true");
  const [activeModuleId, setActiveModuleId] = useState<SheetNavigatorSectionId | null>(null);
  const [switchAnnouncement, setSwitchAnnouncement] = useState("");
  const [menuActionError, setMenuActionError] = useState("");
  const [selectedSpellId, setSelectedSpellId] = useState("");
  const [customizeLayout, setCustomizeLayout] = useState(false);
  const [draggingSectionId, setDraggingSectionId] = useState<SheetLayoutSectionId | null>(null);
  const moduleDialogRef = useRef<HTMLElement | null>(null);
  const moduleReturnFocusRef = useRef(false);
  const draggingSectionRef = useRef<SheetLayoutSectionId | null>(null);
  const editVersion = useRef(0);

  useEffect(() => {
    let active = true;
    setSheet(null);
    setStatus("Opening character...");
    setActiveModuleId(null);
    void getOrCreateCharacterSheet(characterId)
      .then((loaded) => { if (active) { setSheet(loaded); setStatus("Saved locally"); } })
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
    const flush = (event: Event) => {
      if (!sheet || status !== "Unsaved changes") return;
      const saving = saveCharacterSheet(sheet).then((saved) => {
        setSheet(saved);
        setStatus("Saved locally");
      });
      (event as CustomEvent<{ waitUntil?: (promise: Promise<unknown>) => void }>).detail?.waitUntil?.(saving);
      void saving;
    };
    window.addEventListener("vault:flush", flush);
    return () => window.removeEventListener("vault:flush", flush);
  }, [sheet, status]);

  useEffect(() => {
    if (!sheet || sheet.characterId !== characterId) return;
    const announcement = takeCharacterAnnouncement();
    setSwitchAnnouncement(announcement);
    const targetId = takePendingSheetSection();
    if (targetId) {
      window.setTimeout(() => {
        const target = document.getElementById(targetId);
        if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
        else {
          const section = sheetNavigatorSections.find((candidate) => candidate.targetId === targetId);
          if (section) setActiveModuleId(section.id);
        }
      }, 80);
    }
    if (announcement) {
      const timer = window.setTimeout(() => setSwitchAnnouncement(""), 2200);
      return () => window.clearTimeout(timer);
    }
  }, [characterId, sheet]);

  const closeModuleOverlay = () => {
    const shouldReturnFocus = moduleReturnFocusRef.current;
    moduleReturnFocusRef.current = false;
    setActiveModuleId(null);
    if (shouldReturnFocus) window.setTimeout(() => document.querySelector<HTMLButtonElement>(".sheet-section-trigger")?.focus(), 0);
  };

  useEffect(() => {
    if (!activeModuleId) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeModuleOverlay();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => {
      moduleDialogRef.current?.querySelector<HTMLElement>(focusableOverlaySelector)?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeModuleId]);

  const trapModuleFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;

    const focusable = Array.from(moduleDialogRef.current?.querySelectorAll<HTMLElement>(focusableOverlaySelector) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

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
    setMenuActionError("");
    setStatus("Preparing character backup...");
    try {
      await flushPendingCharacterEdits();
      const created = await createCharacterBackup(characterId);
      const result = await downloadBackup(created, "character");
      const action = result.deliveryMethod === "shared" ? "shared" : result.deliveryMethod === "opened" ? "opened in a new tab" : "download started";
      setStatus(`Character export ${action}: ${result.fileName} · ${result.fileSizeLabel} · ${result.timeLabel}`);
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError" ? "Export canceled. No character backup was shared or downloaded." : error instanceof Error ? error.message : "Could not export character";
      setStatus(message);
      setMenuActionError(message);
    }
  };

  const updateCharacterField = async (changes: Record<string, string | number>) => {
    await db.characters.update(characterId, { ...changes, updatedAt: new Date().toISOString() });
  };

  const rollNow = (label: string, formula: string, inlineKey?: string) => {
    try {
      const result = rollFormula(formula);
      setQuickRoll(`${label}: ${result.breakdown}`);
      if (inlineKey) {
        setInlineRolls((current) => ({
          ...current,
          [inlineKey]: { id: result.id, text: `Rolled: ${inlineRollText(result)}` },
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not roll";
      setQuickRoll(message);
      if (inlineKey) {
        setInlineRolls((current) => ({
          ...current,
          [inlineKey]: { id: `${Date.now()}-${inlineKey}`, text: message },
        }));
      }
    }
  };

  const updateSheetFromSpellCast = async (nextSheet: CharacterSheet) => {
    setStatus("Saving locally...");
    const updated = await saveCharacterSheet(nextSheet);
    setSheet(updated);
    setStatus("Saved locally");
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

  const applyRest = (rest: RestKind) => {
    if (!sheet) return;
    const message = restPreviewText(rest);
    if (!message || !window.confirm(message)) return;
    edit((current) => applyRestRecovery(current, rest));
    setQuickRoll(`${restLabels[rest]} applied: configured spell resources recovered.`);
  };

  const longRest = () => {
    applyRest("longRest");
  };

  const shortRest = () => {
    applyRest("shortRest");
  };

  const setAssistantMode = (mode: RollAssistantMode) => {
    setRollMode(mode);
    localStorage.setItem("vault:roll-mode", mode);
  };

  const setAbilityLegendVisible = (visible: boolean) => {
    setShowAbilityLegend(visible);
    localStorage.setItem("vault:ability-legend-hidden", visible ? "false" : "true");
  };

  const scrollToSheetTargetId = (targetId: string) => {
    const target = document.getElementById(targetId);
    if (!target) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.classList.remove("sheet-section-arrival");
    target.scrollIntoView({ behavior: sheetSectionScrollBehavior(reducedMotion), block: "start", inline: "nearest" });
    if (target instanceof HTMLElement) {
      target.focus({ preventScroll: true });
      if (!reducedMotion) {
        window.requestAnimationFrame(() => target.classList.add("sheet-section-arrival"));
        window.setTimeout(() => target.classList.remove("sheet-section-arrival"), 1100);
      }
    }
  };

  const restoreCharacterMenuFocus = () => {
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(".sheet-section-trigger")?.focus(), 0);
  };

  const handleCharacterMenuItem = async (item: CharacterMenuItem) => {
    setMenuActionError("");
    try {
      const intent = characterMenuIntent(item, characterId);
      switch (intent.kind) {
        case "section":
          setActiveModuleId(null);
          scrollToSheetTargetId(intent.targetId);
          return;
        case "overlay":
          moduleReturnFocusRef.current = true;
          if (intent.enableLayoutEditing) setCustomizeLayout(true);
          setActiveModuleId(intent.targetId);
          return;
        case "route":
          await flushPendingCharacterEdits();
          window.location.hash = intent.hash;
          return;
        case "export":
          await exportCharacter();
          restoreCharacterMenuFocus();
          return;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The destination could not be opened.";
      setMenuActionError(`${item.label} could not be opened. ${detail}`);
      restoreCharacterMenuFocus();
    }
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
  const initiativeModifier = initiativeBonus(sheet);
  const layoutOrder = normalizeSheetLayoutOrder(sheet.sheetLayoutOrder);
  const passivePerception = 10 + skillModifier(sheet, "perception");
  const hpMaximum = Math.max(sheet.maxHp, 1);
  const hpPercent = Math.max(0, Math.min(100, Math.round((sheet.currentHp / hpMaximum) * 100)));
  const characterSubtitle = [
    character.ancestry,
    character.characterClass,
    `Level ${character.level}`,
  ].filter(Boolean).join(" / ");
  const conditionsSummary = sheet.notes.trim() ? "Notes" : "Clear";
  const activeSaveCount = abilityIds.filter((ability) => sheet.savingThrows[ability]).length;
  const activeSkillCount = skillIds.filter((skill) => sheet.skillProficiencies[skill]).length;
  const passiveInsight = 10 + skillModifier(sheet, "insight");
  const passiveInvestigation = 10 + skillModifier(sheet, "investigation");
  const attackNoteCount = textCount(sheet.attacks) + textCount(sheet.weapons) + textCount(sheet.damageNotes);
  const preparedSpellCount = textCount(sheet.preparedSpells);
  const savedCantripCount = spells.filter((spell) => spell.level === 0).length;
  const cantripCount = Math.max(textCount(sheet.cantrips), savedCantripCount);
  const selectedSpell = spells.find((spell) => spell.id === selectedSpellId);
  const featureCount = textCount(sheet.classFeatures) + textCount(sheet.speciesTraits) + textCount(sheet.backgroundFeature) + textCount(sheet.feats) + textCount(sheet.specialAbilities);
  const noteCount = textCount(sheet.notes);
  const usedSlotCount = [...Object.values(sheet.spellSlotsUsed), ...Object.values(sheet.pactMagicSlotsUsed)].reduce((total, used) => total + used, 0);
  const totalSlotCount = [...Object.values(sheet.spellSlots), ...Object.values(sheet.pactMagicSlots)].reduce((total, maximum) => total + maximum, 0);

  const renderAbilityScores = () => (
    <div className="ability-score-dashboard">
      {abilityIds.map((ability) => (
        <label className="ability-score-chip" key={ability}>
          <span><b className="ability-label-long">{abilityFullLabels[ability]}</b><b className="ability-label-short">{abilityLabels[ability]}</b></span>
          <strong>{formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10))}</strong>
          <input aria-label={`${abilityFullLabels[ability]} score`} min={1} max={30} onChange={(event) => edit((current) => ({ ...current, abilityScores: { ...current.abilityScores, [ability]: Number(event.target.value) } }))} type="number" value={sheet.abilityScores[ability] ?? 10} />
          <button className="secondary-button compact" onClick={() => rollNow(`${abilityLabels[ability]} check`, `d20${formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10))}`, `ability-${ability}`)} type="button">Roll</button>
          <InlineRollFeedback result={inlineRolls[`ability-${ability}`]} />
        </label>
      ))}
      {showAbilityLegend && <aside className="ability-legend-card" aria-label="Ability abbreviation legend">
        <div className="ability-legend-heading">
          <span>Legend</span>
          <button className="text-button" onClick={() => setAbilityLegendVisible(false)} type="button">Hide</button>
        </div>
        <dl>
          {abilityLegendRows.map((row) => <div key={row.id}><dt>{row.shortLabel}</dt><dd>{row.fullLabel}</dd></div>)}
        </dl>
      </aside>}
    </div>
  );

  const renderSensesPassives = () => (
    <div className="senses-passives-grid">
      <div className="sense-chip">
        <span>Passive Perception</span>
        <strong>{passivePerception}</strong>
      </div>
      <div className="sense-chip">
        <span>Passive Insight</span>
        <strong>{passiveInsight}</strong>
      </div>
      <div className="sense-chip">
        <span>Passive Investigation</span>
        <strong>{passiveInvestigation}</strong>
      </div>
      <div className="sense-chip">
        <span>Speed</span>
        <strong>{sheet.speed}</strong>
      </div>
    </div>
  );

  const renderSavingThrowsPanel = () => (
    <section className="abilities-subpanel">
      <div className="module-header compact-module-header"><div><span className="card-label">Saving throws</span><h3>{activeSaveCount} proficient</h3></div></div>
      <div className="check-list">
        {abilityIds.map((ability) => {
          const saveModifier = abilityModifier(sheet.abilityScores[ability] ?? 10) + (sheet.savingThrows[ability] ? sheet.proficiencyBonus : 0);
          return <div className="proficiency-row rollable-proficiency-row" key={ability}><label className="proficiency-toggle"><input checked={sheet.savingThrows[ability] ?? false} onChange={(event) => edit((current) => ({ ...current, savingThrows: { ...current.savingThrows, [ability]: event.target.checked } }))} type="checkbox" /><span>{abilityLabels[ability]}</span></label><small>{formatModifier(saveModifier)}</small><button className="secondary-button compact" onClick={() => rollNow(`${abilityLabels[ability]} save`, `d20${formatModifier(saveModifier)}`, `save-${ability}`)} type="button">Roll</button><InlineRollFeedback result={inlineRolls[`save-${ability}`]} /></div>;
        })}
      </div>
    </section>
  );

  const renderSkillsPanel = ({ expanded = false, withId = false }: { expanded?: boolean; withId?: boolean } = {}) => {
    const skillRows = <div className="check-list skills-list">
      {skillIds.map((skill) => <div className="proficiency-row rollable-proficiency-row" key={skill}><label className="proficiency-toggle"><input checked={sheet.skillProficiencies[skill] ?? false} onChange={(event) => edit((current) => ({ ...current, skillProficiencies: { ...current.skillProficiencies, [skill]: event.target.checked } }))} type="checkbox" /><span>{skillLabels[skill]}</span></label><small>{abilityLabels[skillAbilities[skill]]} {formatModifier(skillModifier(sheet, skill))}</small><button className="secondary-button compact" onClick={() => rollNow(`${skillLabels[skill]} check`, `d20${formatModifier(skillModifier(sheet, skill))}`, `skill-${skill}`)} type="button">Roll</button><InlineRollFeedback result={inlineRolls[`skill-${skill}`]} /></div>)}
    </div>;

    return <section className="abilities-subpanel" id={withId ? "sheet-section-skills" : undefined} tabIndex={withId ? -1 : undefined}>
      <div className="module-header compact-module-header"><div><span className="card-label">Skills</span><h3>{activeSkillCount} proficient</h3></div></div>
      <div className="skill-proficiency-summary">
        <span>Perception {formatModifier(skillModifier(sheet, "perception"))}</span>
        <span>Insight {formatModifier(skillModifier(sheet, "insight"))}</span>
        <span>Investigation {formatModifier(skillModifier(sheet, "investigation"))}</span>
      </div>
      {expanded ? <div className="module-detail-body skill-detail-body">{skillRows}</div> : <details className="module-detail skill-detail"><summary>Edit skill proficiencies</summary><div className="module-detail-body">{skillRows}</div></details>}
    </section>;
  };

  const renderAbilitiesSavesSensesDetail = () => (
    <div className="abilities-overlay-detail">
      <div className="sheet-region-heading">
        <div>
          <span className="card-label">Abilities, saves, senses</span>
          <h2>At-a-glance checks</h2>
        </div>
        <label className="form-field compact-field"><span>Proficiency</span><input min={2} max={6} onChange={(event) => edit((current) => ({ ...current, proficiencyBonus: Number(event.target.value) }))} type="number" value={sheet.proficiencyBonus} /></label>
        {!showAbilityLegend && <button className="secondary-button compact ability-legend-toggle" onClick={() => setAbilityLegendVisible(true)} type="button">Show legend</button>}
      </div>
      {renderAbilityScores()}
      {renderSensesPassives()}
      <div className="saves-skills-grid">
        {renderSavingThrowsPanel()}
        {renderSkillsPanel({ expanded: true })}
      </div>
    </div>
  );

  const renderBookDetail = () => (
    <div className="book-overlay-actions">
      <div className="module-summary">
        <span>Reference tools</span>
        <strong>Spellbook and PDF shelf</strong>
        <small>Opening these tools is an intentional route change. The navigator itself keeps you on this sheet.</small>
      </div>
      <div className="layout-customize-actions">
        <a className="primary-button button-link" href={characterMenuRouteHash("spellbook", characterId)}>Open spellbook</a>
        <a className="secondary-button button-link" href={characterMenuRouteHash("pdf-library", characterId)}>Open PDF Library</a>
      </div>
    </div>
  );

  const renderLayoutDetail = () => (
    <div className="layout-overlay-actions">
      <div className="module-summary">
        <span>Per character</span>
        <strong>{customizeLayout ? "Layout editing is on" : "Customize module order"}</strong>
        <small>Only gameplay modules are draggable. Dashboard and abilities stay fixed.</small>
      </div>
      <div className="layout-customize-actions">
        <button className={customizeLayout ? "primary-button" : "secondary-button"} onClick={() => setCustomizeLayout((current) => !current)} type="button">{customizeLayout ? "Done editing" : "Start customizing"}</button>
        <button className="secondary-button" onClick={resetLayout} type="button">Reset layout</button>
      </div>
    </div>
  );

  const renderModuleDetail = (id: SheetLayoutSectionId) => {
    switch (id) {
      case "dice":
        return <DiceRoller compact context="Local only. Results are not sent anywhere." label="Table dice" />;
      case "roll-helper":
        return <div className="roll-assistant-grid">
          {rollRows.map((row) => <article className="roll-assistant-card" key={row.id}>
            <div><strong>{row.label}</strong><span>{row.formula}</span>{row.bonus !== null && <small>Total bonus {formatModifier(row.bonus)}</small>}</div>
            <button className="primary-button compact" onClick={() => row.rollable ? rollNow(row.label, row.formula, `assistant-${row.id}`) : setQuickRoll(`${row.label}: ${row.explanation}`)} type="button">{row.rollable ? "Roll" : "Explain"}</button>
            {row.rollable && <InlineRollFeedback result={inlineRolls[`assistant-${row.id}`]} />}
            {rollMode === "beginner" && <p>{row.explanation}</p>}
          </article>)}
        </div>;
      case "identity":
        return <div className="form-grid">
          <label className="form-field"><span>Name</span><input maxLength={100} onChange={(event) => void updateCharacterField({ name: event.target.value })} value={character.name} /></label>
          <label className="form-field"><span>Player name</span><input maxLength={100} onChange={(event) => void updateCharacterField({ playerName: event.target.value })} value={character.playerName} /></label>
          <label className="form-field"><span>Campaign</span><input maxLength={100} onChange={(event) => void updateCharacterField({ campaign: event.target.value })} value={character.campaign} /></label>
          <label className="form-field level-up-field"><span>Level <LevelUpHint /></span><input max={20} min={1} onChange={(event) => void updateCharacterField({ level: Number(event.target.value) }).then(() => edit((current) => ({ ...current, proficiencyBonus: proficiencyBonusForLevel(Number(event.target.value)) })))} type="number" value={character.level} /></label>
          <label className="form-field"><span>Class</span><input maxLength={100} onChange={(event) => void updateCharacterField({ characterClass: event.target.value })} value={character.characterClass} /></label>
          <label className="form-field"><span>Species / Ancestry</span><input maxLength={100} onChange={(event) => void updateCharacterField({ ancestry: event.target.value })} value={character.ancestry} /></label>
          <label className="form-field full-width"><span>Background / Origin</span><input maxLength={100} onChange={(event) => void updateCharacterField({ background: event.target.value })} value={character.background} /></label>
          <label className="form-field full-width"><span>Short concept</span><input maxLength={500} onChange={(event) => void updateCharacterField({ concept: event.target.value })} value={character.concept} /></label>
        </div>;
      case "level-preview":
        return <>
          <div className="level-up-grid">
            <div><small>Current level</small><strong>{levelPreview.currentLevel}</strong></div>
            <div><small>Next level</small><strong>{levelPreview.nextLevel ?? "Max"}</strong></div>
            <div><small>Proficiency now</small><strong>{formatModifier(levelPreview.currentProficiencyBonus)}</strong></div>
            <div><small>Proficiency next</small><strong>{formatModifier(levelPreview.nextProficiencyBonus)}</strong></div>
          </div>
          {levelPreview.proficiencyChanges && <p className="inline-message">At level {levelPreview.nextLevel}, proficiency bonus changes to <strong>{formatModifier(levelPreview.nextProficiencyBonus)}</strong>.</p>}
          <div className="level-up-field-list">{levelPreview.fields.map((field) => <span key={field}>{field} <LevelUpHint /></span>)}</div>
        </>;
      case "roleplay":
        return <div className="form-grid">
          <label className="form-field"><span>Personality notes</span><textarea onChange={(event) => void updateCharacterField({ personalityNotes: event.target.value })} rows={5} value={character.personalityNotes} /></label>
          <label className="form-field"><span>Goals</span><textarea onChange={(event) => void updateCharacterField({ goals: event.target.value })} rows={5} value={character.goals} /></label>
          <label className="form-field"><span>Important relationships</span><textarea onChange={(event) => void updateCharacterField({ importantRelationships: event.target.value })} rows={5} value={character.importantRelationships} /></label>
          <label className="form-field"><span>Roleplay notes</span><textarea onChange={(event) => void updateCharacterField({ roleplayNotes: event.target.value })} rows={5} value={character.roleplayNotes} /></label>
          <label className="form-field full-width"><span>Backstory</span><textarea onChange={(event) => void updateCharacterField({ backstory: event.target.value, summary: event.target.value.slice(0, 20000) })} rows={8} value={character.backstory} /></label>
        </div>;
      case "health-combat":
        return <div className="play-grid">
          <article className="panel hp-panel">
            <div className="form-section-heading"><div><span className="card-label">Hit points</span><h2>Health</h2></div></div>
            <div className="hp-values">
              <label className="stat-field"><span>Current</span><input min={0} onChange={(event) => edit((current) => ({ ...current, currentHp: Number(event.target.value) }))} type="number" value={sheet.currentHp} /></label>
              <span className="hp-divider">/</span>
              <label className="stat-field level-up-field"><span>Maximum <LevelUpHint /></span><input min={0} onChange={(event) => edit((current) => ({ ...current, maxHp: Number(event.target.value) }))} type="number" value={sheet.maxHp} /></label>
              <label className="stat-field temp-hp"><span>Temporary</span><input min={0} onChange={(event) => edit((current) => ({ ...current, temporaryHp: Number(event.target.value) }))} type="number" value={sheet.temporaryHp} /></label>
            </div>
            <div className="hp-controls">
              <div className="hp-before-after"><strong>Before</strong><span>{sheet.currentHp}/{sheet.maxHp} HP · {sheet.temporaryHp} temp</span>{hpPreview && <><strong>Last change</strong><span>{hpPreview}</span></>}</div>
              <div className="hp-entry-grid"><label className="form-field"><span>Damage input</span><input min={0} onChange={(event) => setDamageAmount(Number(event.target.value))} type="number" value={damageAmount} /></label><label className="form-field"><span>Healing input</span><input min={0} onChange={(event) => setHealingAmount(Number(event.target.value))} type="number" value={healingAmount} /></label></div>
              <div className="hp-action-buttons"><button className="touch-button damage-button" onClick={() => void changeHp("damage", damageAmount)} type="button">Apply Damage</button><button className="touch-button healing-button" onClick={() => void changeHp("healing", healingAmount)} type="button">Apply Healing</button></div>
              <div className="hp-quick-deltas" aria-label="Quick HP changes">{[-1, -5, -10].map((amount) => <button className="quick-value damage-quick" key={amount} onClick={() => void changeHp("damage", Math.abs(amount))} type="button">{amount}</button>)}{[1, 5, 10].map((amount) => <button className="quick-value healing-quick" key={amount} onClick={() => void changeHp("healing", amount)} type="button">+{amount}</button>)}</div>
            </div>
          </article>
          <article className="panel combat-panel" id="sheet-section-speed-defenses" tabIndex={-1}>
            <div className="form-section-heading"><div><span className="card-label">Combat</span><h2>Defenses and movement</h2></div></div>
            <div className="combat-stats"><label className="big-stat"><span>Armor Class</span><input min={0} onChange={(event) => edit((current) => ({ ...current, armorClass: Number(event.target.value) }))} type="number" value={sheet.armorClass} /></label><label className="big-stat"><span>Initiative</span><input onChange={(event) => edit((current) => ({ ...current, initiative: Number(event.target.value) }))} type="number" value={initiativeModifier} /></label><label className="big-stat"><span>Speed</span><input min={0} onChange={(event) => edit((current) => ({ ...current, speed: Number(event.target.value) }))} type="number" value={sheet.speed} /></label></div>
            <div className="form-grid combat-extra-grid"><label className="form-field level-up-field"><span>Hit Dice <LevelUpHint /></span><input onChange={(event) => edit((current) => ({ ...current, hitDice: event.target.value }))} value={sheet.hitDice} /></label><label className="form-field"><span>Death save successes</span><input max={3} min={0} onChange={(event) => edit((current) => ({ ...current, deathSaveSuccesses: Number(event.target.value) }))} type="number" value={sheet.deathSaveSuccesses} /></label><label className="form-field"><span>Death save failures</span><input max={3} min={0} onChange={(event) => edit((current) => ({ ...current, deathSaveFailures: Number(event.target.value) }))} type="number" value={sheet.deathSaveFailures} /></label><div className="inline-roll-control"><button className="secondary-button compact" disabled={!initiativeRow} onClick={() => initiativeRow && rollNow("Initiative", initiativeRow.formula, "combat-initiative")} type="button">Roll initiative</button><InlineRollFeedback result={inlineRolls["combat-initiative"]} /></div><div className="inline-roll-control"><button className="secondary-button compact" disabled={!sheet.hitDice.trim()} onClick={() => rollNow("Hit Dice", sheet.hitDice, "combat-hit-dice")} type="button">Roll hit dice</button><InlineRollFeedback result={inlineRolls["combat-hit-dice"]} /></div><button className="secondary-button compact" onClick={() => setActiveModuleId("notes")} type="button">Conditions / notes</button></div>
          </article>
        </div>;
      case "attacks":
        return <div className="form-grid">
          <label className="form-field"><span>Attacks</span><textarea onChange={(event) => edit((current) => ({ ...current, attacks: event.target.value }))} rows={5} value={sheet.attacks} /></label>
          <label className="form-field"><span>Weapons</span><textarea onChange={(event) => edit((current) => ({ ...current, weapons: event.target.value }))} rows={5} value={sheet.weapons} /></label>
          <label className="form-field full-width"><span>Damage notes</span><textarea onChange={(event) => edit((current) => ({ ...current, damageNotes: event.target.value }))} rows={4} value={sheet.damageNotes} /></label>
          <div className="full-width"><DiceRoller compact context="Use this for attack or damage formulas from your notes." initialFormula="d20" label="Attack roller" /></div>
        </div>;
      case "training":
        return <div className="form-grid"><label className="form-field"><span>Armor proficiencies</span><textarea onChange={(event) => edit((current) => ({ ...current, armorProficiencies: event.target.value }))} rows={4} value={sheet.armorProficiencies} /></label><label className="form-field"><span>Weapon proficiencies</span><textarea onChange={(event) => edit((current) => ({ ...current, weaponProficiencies: event.target.value }))} rows={4} value={sheet.weaponProficiencies} /></label><label className="form-field"><span>Tool proficiencies</span><textarea onChange={(event) => edit((current) => ({ ...current, toolProficiencies: event.target.value }))} rows={4} value={sheet.toolProficiencies} /></label><label className="form-field"><span>Languages</span><textarea onChange={(event) => edit((current) => ({ ...current, languages: event.target.value }))} rows={4} value={sheet.languages} /></label></div>;
      case "spells":
        return <>
          <div className="form-grid"><label className="form-field"><span>Spellcasting ability</span><select onChange={(event) => edit((current) => ({ ...current, spellcastingAbility: event.target.value ? event.target.value as AbilityId : null }))} value={sheet.spellcastingAbility ?? ""}><option value="">None / not set</option>{abilityIds.map((ability) => <option key={ability} value={ability}>{abilityLabels[ability]}</option>)}</select></label><label className="form-field"><span>Spell save DC</span><input min={0} onChange={(event) => edit((current) => ({ ...current, spellSaveDc: Number(event.target.value) }))} type="number" value={sheet.spellSaveDc} /></label><label className="form-field"><span>Spell attack bonus</span><input onChange={(event) => edit((current) => ({ ...current, spellAttackBonus: Number(event.target.value) }))} type="number" value={sheet.spellAttackBonus} /></label><label className="form-field level-up-field"><span>Spell slots <LevelUpHint /></span><div className="slot-grid">{Array.from({ length: 9 }, (_, index) => String(index + 1)).map((level) => <label key={level}><small>L{level}</small><input min={0} onChange={(event) => edit((current) => ({ ...current, spellSlots: { ...current.spellSlots, [level]: Number(event.target.value) } }))} type="number" value={sheet.spellSlots[level] ?? 0} /></label>)}</div></label><label className="form-field"><span>Cantrips</span><textarea onChange={(event) => edit((current) => ({ ...current, cantrips: event.target.value }))} rows={5} value={sheet.cantrips} /></label><label className="form-field"><span>Prepared spells</span><textarea onChange={(event) => edit((current) => ({ ...current, preparedSpells: event.target.value }))} rows={5} value={sheet.preparedSpells} /></label><label className="form-field full-width"><span>Spell notes</span><textarea onChange={(event) => edit((current) => ({ ...current, spellNotes: event.target.value }))} rows={5} value={sheet.spellNotes} /></label></div>
          <div className="sheet-spell-list">
            <div className="form-section-heading"><div><span className="card-label">Prepared reference</span><h3>{spells.length} saved spells</h3></div><a className="secondary-button compact button-link" href={characterMenuRouteHash("spellbook", characterId)}>Manage spellbook</a></div>
            {spells.length ? <div className="spell-play-grid">{spells.map((spell) => <button className="spell-play-card" key={spell.id} onClick={() => setSelectedSpellId(spell.id)} type="button"><span>{spell.level === 0 ? "Cantrip" : `Level ${spell.level}`}</span><strong>{spell.name}</strong><small>{spell.school} · {spell.castingTime}</small></button>)}</div> : <div className="spell-empty compact-empty"><strong>No saved spells yet</strong><span>Add spells in the full spellbook, then tap one here for play details.</span></div>}
          </div>
          <SpellSlotTracker onChange={(nextSheet) => edit(() => nextSheet)} sheet={sheet} />
        </>;
      case "features":
        return <div className="form-grid"><label className="form-field level-up-field"><span>Class features <LevelUpHint /></span><textarea onChange={(event) => edit((current) => ({ ...current, classFeatures: event.target.value }))} rows={6} value={sheet.classFeatures} /></label><label className="form-field"><span>Species traits</span><textarea onChange={(event) => edit((current) => ({ ...current, speciesTraits: event.target.value }))} rows={6} value={sheet.speciesTraits} /></label><label className="form-field"><span>Background feature</span><textarea onChange={(event) => edit((current) => ({ ...current, backgroundFeature: event.target.value }))} rows={5} value={sheet.backgroundFeature} /></label><label className="form-field level-up-field"><span>Feats <LevelUpHint /></span><textarea onChange={(event) => edit((current) => ({ ...current, feats: event.target.value }))} rows={5} value={sheet.feats} /></label><label className="form-field full-width"><span>Special abilities</span><textarea onChange={(event) => edit((current) => ({ ...current, specialAbilities: event.target.value }))} rows={6} value={sheet.specialAbilities} /></label></div>;
      case "notes":
        return <label className="form-field full-width"><span>Notes</span><textarea onChange={(event) => edit((current) => ({ ...current, notes: event.target.value }))} placeholder="Conditions, reminders, NPC names, session details..." rows={12} value={sheet.notes} /></label>;
      case "soul-reaper":
        return <SoulReaperSection characterId={characterId} characterLevel={character.level} />;
      case "inventory":
        return <InventorySection characterId={characterId} />;
    }
  };

  const renderOverlayDetail = (id: SheetNavigatorSectionId) => {
    if (isSheetLayoutSectionId(id)) return renderModuleDetail(id);
    switch (id) {
      case "abilities":
        return renderAbilitiesSavesSensesDetail();
      case "skills":
        return renderSkillsPanel({ expanded: true });
      case "speed-defenses":
        return renderModuleDetail("health-combat");
      case "book":
        return renderBookDetail();
      case "layout":
        return renderLayoutDetail();
      case "portrait":
        return <CharacterPortraitField
          characterName={character.name}
          label="Portrait"
          onChange={(portraitDataUrl) => updateCharacterField({ portraitDataUrl })}
          value={character.portraitDataUrl ?? ""}
        />;
      case "dashboard":
        return null;
    }
  };

  const openModuleOverlay = (id: SheetNavigatorSectionId) => {
    moduleReturnFocusRef.current = false;
    setActiveModuleId(id);
  };

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
      <section className="dashboard" id="sheet-section-dashboard" aria-labelledby="sheet-character-title" tabIndex={-1}>
        <CharacterPortraitField
          characterName={character.name}
          compact
          label="Portrait"
          onChange={(portraitDataUrl) => updateCharacterField({ portraitDataUrl })}
          value={character.portraitDataUrl ?? ""}
        />

        <header className="sheet-character-header">
          <span className="eyebrow">Live play HUD</span>
          <h1 id="sheet-character-title">{character.name}</h1>
          <p>{characterSubtitle || "Touch-friendly live play sheet"}</p>
          <div className="dashboard-actions">
            {customizeLayout && <button className="secondary-button compact" onClick={resetLayout} type="button">Reset Layout</button>}
            <button className={customizeLayout ? "primary-button compact" : "secondary-button compact"} data-testid="customize-layout-button" onClick={() => setCustomizeLayout((current) => !current)} type="button">{customizeLayout ? "Done" : "Customize Layout"}</button>
            <a className="primary-button compact button-link" href={characterMenuRouteHash("spellbook", characterId)}>Spellbook</a>
            <button className="secondary-button compact" onClick={() => void exportCharacter()} type="button">Export</button>
            <a className="secondary-button compact button-link" href={characterMenuRouteHash("profile", characterId)}>Profile</a>
          </div>
        </header>

        <div className="combat-summary" aria-label="Combat summary">
          <button className="combat-summary-card armor-card" onClick={() => setActiveModuleId("health-combat")} type="button">
            <span>Armor Class</span>
            <strong>{sheet.armorClass}</strong>
            <small>Defense</small>
          </button>
          <button className="combat-summary-card initiative-card" onClick={() => initiativeRow ? rollNow("Initiative", initiativeRow.formula, "dashboard-initiative") : setActiveModuleId("health-combat")} type="button">
            <span>Initiative</span>
            <strong>{formatModifier(initiativeModifier)}</strong>
            <small>{initiativeRow ? "Tap to roll" : "Edit in combat"}</small>
            <InlineRollFeedback result={inlineRolls["dashboard-initiative"]} />
          </button>
          <button className="combat-summary-card hp-summary-card" onClick={() => setActiveModuleId("health-combat")} type="button">
            <span>Hit Points</span>
            <strong>{sheet.currentHp}/{sheet.maxHp}</strong>
            <small>{sheet.temporaryHp} temporary</small>
            <i aria-hidden="true"><b style={{ width: `${hpPercent}%` }} /></i>
          </button>
          <button className="combat-summary-card conditions-card" onClick={() => setActiveModuleId("notes")} type="button">
            <span>Conditions</span>
            <strong>{conditionsSummary}</strong>
            <small>Play notes</small>
          </button>
          <div className="inspiration-status" aria-label="Inspiration status">
            <span>Heroic Inspiration</span>
            <strong>Ready</strong>
          </div>
          <div className="important-combat-status">
            <span><strong>Speed</strong>{sheet.speed}</span>
            <span><strong>Hit Dice</strong>{sheet.hitDice || "Unset"}</span>
            <span><strong>Death Saves</strong>{sheet.deathSaveSuccesses}S / {sheet.deathSaveFailures}F</span>
          </div>
        </div>

        <div className="sheet-header-meta">
          <span>{character.campaign || "No campaign set"}</span>
          <strong>{status}</strong>
        </div>
      </section>

      <CharacterHud character={character} items={characterMenuItems} onSelectMenuItem={(item) => void handleCharacterMenuItem(item)} />

      {switchAnnouncement && <p aria-live="polite" className="character-switch-toast" role="status">{switchAnnouncement}</p>}
      {menuActionError && <p aria-live="assertive" className="panel inline-message tool-status" role="alert">{menuActionError}</p>}

      <section className="abilities-panel abilities-senses-region" id="sheet-section-abilities" aria-labelledby="abilities-senses-title" tabIndex={-1}>
        <div className="sheet-region-heading">
          <div>
            <span className="card-label">Abilities, saves, senses</span>
            <h2 id="abilities-senses-title">At-a-glance checks</h2>
          </div>
          <label className="form-field compact-field"><span>Proficiency</span><input min={2} max={6} onChange={(event) => edit((current) => ({ ...current, proficiencyBonus: Number(event.target.value) }))} type="number" value={sheet.proficiencyBonus} /></label>
          {!showAbilityLegend && <button className="secondary-button compact ability-legend-toggle" onClick={() => setAbilityLegendVisible(true)} type="button">Show legend</button>}
        </div>
        {renderAbilityScores()}
        {renderSensesPassives()}
        <div className="saves-skills-grid">
          {renderSavingThrowsPanel()}
          {renderSkillsPanel({ withId: true })}
        </div>
      </section>

      {quickRoll && <p className="panel inline-message tool-status" role="status">{quickRoll}</p>}

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

      {activeModuleId && <div className="module-overlay" onMouseDown={closeModuleOverlay} role="presentation">
        <section
          aria-labelledby="module-overlay-title"
          aria-modal="true"
          className="module-overlay-dialog"
          onKeyDown={trapModuleFocus}
          onMouseDown={(event) => event.stopPropagation()}
          ref={moduleDialogRef}
          role="dialog"
        >
          <div className="module-overlay-header">
            <div>
              <span className="card-label">Live play module</span>
              <h2 id="module-overlay-title">{overlaySectionTitles[activeModuleId]}</h2>
            </div>
            <button aria-label="Close module" autoFocus className="module-overlay-close" onClick={closeModuleOverlay} type="button">X</button>
          </div>
          <div className="module-overlay-body">
            {renderOverlayDetail(activeModuleId)}
          </div>
        </section>
      </div>}

      {selectedSpell && <SpellDetailOverlay
        onActivity={setQuickRoll}
        onClose={() => setSelectedSpellId("")}
        onSheetChange={updateSheetFromSpellCast}
        sheet={sheet}
        spell={selectedSpell}
      />}

      <div className={customizeLayout ? "sheet-layout-stack gameplay-grid customizing" : "sheet-layout-stack gameplay-grid"} aria-label="Gameplay modules">
      <LayoutCard {...layoutProps("dice")}>
      <GameplayCard
        eyebrow="Optional rolling"
        title="Dice"
        summary={<div className="module-summary"><span>Table dice</span><strong>Quick roller</strong><small>Local only</small></div>}
        onOpenDetails={() => openModuleOverlay("dice")}
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("roll-helper")}>
      <GameplayCard
        eyebrow="Live play helper"
        title="Rolls"
        summary={<div className="module-summary"><span>Roll assistant</span><strong>{rollRows.length} prompts</strong><small>Mode: {rollMode}</small></div>}
        onOpenDetails={() => openModuleOverlay("roll-helper")}
        actions={
          <div className="mode-toggle">
            <button className={rollMode === "beginner" ? "secondary-button compact active" : "secondary-button compact"} onClick={() => setAssistantMode("beginner")} type="button">Beginner</button>
            <button className={rollMode === "veteran" ? "secondary-button compact active" : "secondary-button compact"} onClick={() => setAssistantMode("veteran")} type="button">Veteran</button>
          </div>
        }
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("identity")}>
      <GameplayCard
        eyebrow="Overview"
        title="Identity"
        summary={<div className="module-summary"><span>{character.campaign || "No campaign"}</span><strong>{character.background || "Background unset"}</strong><small>{character.concept || "No concept yet"}</small></div>}
        onOpenDetails={() => openModuleOverlay("identity")}
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("level-preview")}>
      <GameplayCard
        eyebrow="Level up foundation"
        title="Next level"
        summary={<div className="module-summary"><span>Current {levelPreview.currentLevel}</span><strong>{levelPreview.nextLevel ? `Next ${levelPreview.nextLevel}` : "Max level"}</strong><small>{levelPreview.proficiencyChanges ? `Proficiency becomes ${formatModifier(levelPreview.nextProficiencyBonus)}` : "Manual control"}</small></div>}
        actions={<span className="status-badge">Manual control</span>}
        onOpenDetails={() => openModuleOverlay("level-preview")}
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("roleplay")}>
      <GameplayCard
        eyebrow="Biography"
        title="Biography"
        summary={<div className="module-summary"><span>{character.personalityNotes ? "Personality saved" : "Personality empty"}</span><strong>{character.goals ? "Goals noted" : "No goals yet"}</strong><small>{character.backstory ? "Backstory available" : "No backstory yet"}</small></div>}
        onOpenDetails={() => openModuleOverlay("roleplay")}
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("health-combat")}>
      <GameplayCard
        eyebrow="HP details"
        title="Health"
        summary={<div className="module-summary hp-module-summary"><span>{sheet.currentHp}/{sheet.maxHp} HP</span><strong>{sheet.temporaryHp} temp</strong><small>{hpPreview || "Ready for damage or healing"}</small><div className="hp-quick-deltas compact-deltas" aria-label="Quick HP changes">{[-1, -5, -10].map((amount) => <button className="quick-value damage-quick" key={amount} onClick={() => void changeHp("damage", Math.abs(amount))} type="button">{amount}</button>)}{[1, 5, 10].map((amount) => <button className="quick-value healing-quick" key={amount} onClick={() => void changeHp("healing", amount)} type="button">+{amount}</button>)}</div></div>}
        actions={<div className="inline-roll-control"><button className="secondary-button compact" disabled={!initiativeRow} onClick={() => initiativeRow && rollNow("Initiative", initiativeRow.formula, "health-initiative")} type="button">Roll initiative</button><InlineRollFeedback result={inlineRolls["health-initiative"]} /></div>}
        onOpenDetails={() => openModuleOverlay("health-combat")}
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("attacks")}>
      <GameplayCard
        eyebrow="Weapons and actions"
        title="Attacks"
        summary={<div className="module-summary"><span>{textCount(sheet.attacks)} attack lines</span><strong>{textCount(sheet.weapons)} weapon notes</strong><small>{attackNoteCount ? `${attackNoteCount} total combat notes` : "No attacks recorded"}</small></div>}
        actions={<div className="inline-roll-control"><button className="primary-button compact" onClick={() => rollNow("Attack", "d20", "attacks-d20")} type="button">Roll d20</button><InlineRollFeedback result={inlineRolls["attacks-d20"]} /></div>}
        onOpenDetails={() => openModuleOverlay("attacks")}
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("training")}>
      <GameplayCard
        eyebrow="Training"
        title="Training"
        summary={<div className="module-summary"><span>{sheet.languages ? "Languages saved" : "No languages"}</span><strong>{sheet.toolProficiencies ? "Tools noted" : "Tools empty"}</strong><small>Armor, weapons, tools, languages</small></div>}
        onOpenDetails={() => openModuleOverlay("training")}
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("spells")}>
      <GameplayCard
        eyebrow="Spellbook and slots"
        title="Spells"
        summary={<div className="module-summary"><span>{preparedSpellCount} prepared</span><strong>{cantripCount} cantrips</strong><small>{totalSlotCount ? `${Math.max(0, totalSlotCount - usedSlotCount)} / ${totalSlotCount} slots remaining` : "No slots set"}</small></div>}
        actions={<><button className="secondary-button compact" onClick={shortRest} type="button">Short Rest</button><button className="primary-button compact" onClick={longRest} type="button">Long Rest</button><a className="secondary-button compact button-link" href={characterMenuRouteHash("spellbook", characterId)}>Full spellbook</a></>}
        onOpenDetails={() => openModuleOverlay("spells")}
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("features")}>
      <GameplayCard
        eyebrow="Class features"
        title="Features"
        summary={<div className="module-summary"><span>{textCount(sheet.classFeatures)} class lines</span><strong>{textCount(sheet.speciesTraits)} species lines</strong><small>{featureCount ? `${featureCount} total feature notes` : "No features recorded"}</small></div>}
        onOpenDetails={() => openModuleOverlay("features")}
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("notes")}>
      <GameplayCard
        eyebrow="Notes and journal"
        title="Notes"
        summary={<div className="module-summary"><span>{conditionsSummary}</span><strong>{noteCount} note lines</strong><small>{sheet.notes.trim() ? sheet.notes.trim().slice(0, 90) : "Conditions, reminders, session notes"}</small></div>}
        actions={<button className="secondary-button compact" onClick={() => openModuleOverlay("notes")} type="button">Open notes</button>}
        onOpenDetails={() => openModuleOverlay("notes")}
      />
      </LayoutCard>

      <LayoutCard {...layoutProps("soul-reaper")}>
      <GameplayCard
        eyebrow="Optional class track"
        title="Soul Reaper"
        summary={<div className="module-summary"><span>DM-granted</span><strong>Class track</strong><small>Open details if this character uses it</small></div>}
        onOpenDetails={() => openModuleOverlay("soul-reaper")}
      />
      </LayoutCard>
      <LayoutCard {...layoutProps("inventory")}>
      <GameplayCard
        eyebrow="Equipment and items"
        title="Inventory"
        summary={<div className="module-summary"><span>Character-owned gear</span><strong>Containers and items</strong><small>Add, edit, equip, and favorite items</small></div>}
        onOpenDetails={() => openModuleOverlay("inventory")}
      />
      </LayoutCard>
      </div>
    </section>
  );
}
