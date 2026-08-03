import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { AbilityId, Character, CharacterSheet, ConditionId, SkillId } from "../../domain/models";
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
import { restLabels, type RestKind } from "../../rules/spellSlots";
import { applyHudRestRecovery, buildHudRestPreview } from "../../rules/hudRest";
import { rollFormula, type DiceRollResult } from "../../dice/dice";
import { applyDamage, applyHealing } from "../../rules/hitPoints";
import { buildRollAssistantRows, initiativeBonus, type RollAssistantMode } from "../../rules/rollAssistant";
import { createCharacterBackup, downloadBackup } from "../../storage/backups";
import {
  characterMenuIntent,
  characterMenuItems,
  characterMenuRouteHash,
  hudModuleIsAvailable,
  isSheetLayoutSectionId,
  moveSheetLayoutSection,
  normalizeSheetLayoutOrder,
  normalizeSheetModuleVisibility,
  reorderSheetLayoutOrder,
  setSheetModuleVisibility,
  sheetModuleDefinitions,
  sheetSectionScrollBehavior,
  sheetNavigatorSections,
  sheetSectionDomId,
  type CharacterMenuItem,
  type SheetLayoutPlacement,
  type SheetLayoutSectionId,
  type SheetNavigatorSectionId,
} from "./sheetLayout";
import { conditionDefinitions, conditionSummary } from "./conditions";

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

const layoutSectionTitles = Object.fromEntries(
  sheetModuleDefinitions.map((module) => [module.id, module.title]),
) as Record<SheetLayoutSectionId, string>;

const overlaySectionTitles: Record<SheetNavigatorSectionId, string> = {
  ...layoutSectionTitles,
  dashboard: "Dashboard",
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
  id: SheetLayoutSectionId;
  style?: CSSProperties;
  visible: boolean;
};

export function LayoutCard({ children, id, style, visible }: LayoutCardProps) {
  if (!visible) return null;
  return (
    <div className="layout-card" data-layout-card-id={id} data-module-visible="true" data-sheet-section-id={id} id={sheetSectionDomId(id)} style={style} tabIndex={-1}>
      <div className="layout-card-content">{children}</div>
    </div>
  );
}

type LayoutCustomizerListProps = {
  draggingId: SheetLayoutSectionId | null;
  order: SheetLayoutSectionId[];
  visibility: Record<SheetLayoutSectionId, boolean>;
  onDragEnd: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragStart: (id: SheetLayoutSectionId, event: PointerEvent<HTMLButtonElement>) => void;
  onMove: (id: SheetLayoutSectionId, direction: "up" | "down") => void;
  onVisibilityChange: (id: SheetLayoutSectionId, visible: boolean) => void;
};

export function LayoutCustomizerList({ draggingId, order, visibility, onDragEnd, onDragMove, onDragStart, onMove, onVisibilityChange }: LayoutCustomizerListProps) {
  return (
    <div aria-label="Home Screen modules" className="layout-module-list">
      {order.map((id, index) => {
        const module = sheetModuleDefinitions.find((candidate) => candidate.id === id)!;
        const visible = visibility[id];
        return <div className={`layout-card-controls${visible ? " visible" : " hidden"}${draggingId === id ? " dragging" : ""}`} data-layout-card-id={id} data-module-visible={visible} key={id}>
          <label className="layout-visibility-toggle">
            <input aria-label={`Show ${module.label} on Home Screen`} checked={visible} onChange={(event) => onVisibilityChange(id, event.target.checked)} type="checkbox" />
            <span aria-hidden="true" className="layout-module-icon">{module.icon}</span>
            <span><strong>{module.label}</strong><small>{visible ? "Shown on Home Screen" : "Hidden from Home Screen"}</small></span>
          </label>
          <button
            aria-label={`Drag ${module.label}`}
            aria-pressed={draggingId === id}
            className="layout-drag-handle"
            onPointerCancel={onDragEnd}
            onPointerDown={(event) => onDragStart(id, event)}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            type="button"
          >
            <span aria-hidden="true">::</span>
            <strong>Drag</strong>
          </button>
          <div className="layout-move-buttons">
            <button className="secondary-button compact" disabled={index === 0} onClick={() => onMove(id, "up")} type="button">Move up</button>
            <button className="secondary-button compact" disabled={index === order.length - 1} onClick={() => onMove(id, "down")} type="button">Move down</button>
          </div>
        </div>;
      })}
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

export function CharacterSheetPage({ characterId, suppressPortrait = false }: { characterId: string; suppressPortrait?: boolean }) {
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const spells = useLiveQuery(() => db.spells.where("characterId").equals(characterId).toArray(), [characterId]) ?? [];
  const soulReaperProgression = useLiveQuery(() => db.soulReaperProgressions.get(characterId), [characterId]);
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
  const [activeRest, setActiveRest] = useState<RestKind | null>(null);
  const [switchAnnouncement, setSwitchAnnouncement] = useState("");
  const [menuActionError, setMenuActionError] = useState("");
  const [selectedSpellId, setSelectedSpellId] = useState("");
  const [customizeLayout, setCustomizeLayout] = useState(false);
  const [draggingSectionId, setDraggingSectionId] = useState<SheetLayoutSectionId | null>(null);
  const moduleDialogRef = useRef<HTMLElement | null>(null);
  const moduleReturnFocusRef = useRef(false);
  const overlayReturnElementRef = useRef<HTMLElement | null>(null);
  const draggingSectionRef = useRef<SheetLayoutSectionId | null>(null);
  const editVersion = useRef(0);

  useEffect(() => {
    let active = true;
    setSheet(null);
    setStatus("Opening character...");
    setActiveModuleId(null);
    setActiveRest(null);
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
    const returnElement = overlayReturnElementRef.current;
    moduleReturnFocusRef.current = false;
    overlayReturnElementRef.current = null;
    setActiveModuleId(null);
    setActiveRest(null);
    window.setTimeout(() => {
      if (returnElement?.isConnected) returnElement.focus();
      else if (shouldReturnFocus) document.querySelector<HTMLButtonElement>(".sheet-section-trigger")?.focus();
    }, 0);
  };

  useEffect(() => {
    if (!activeModuleId && !activeRest) return;
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
  }, [activeModuleId, activeRest]);

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

  const updateCharacterField = async (changes: Partial<Character>) => {
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

  const openRest = (rest: RestKind) => {
    if (!sheet) return;
    overlayReturnElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveModuleId(null);
    setActiveRest(rest);
  };

  const confirmRest = () => {
    if (!activeRest) return;
    const rest = activeRest;
    edit((current) => applyHudRestRecovery(current, rest));
    setQuickRoll(`${restLabels[rest]} applied. Recovery was saved atomically.`);
    closeModuleOverlay();
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

  const openLayoutCustomizer = () => {
    setCustomizeLayout(true);
    window.requestAnimationFrame(() => scrollToSheetTargetId("sheet-layout-customizer"));
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
          if (intent.enableLayoutEditing) {
            moduleReturnFocusRef.current = false;
            setActiveModuleId(null);
            openLayoutCustomizer();
            return;
          }
          overlayReturnElementRef.current = document.querySelector<HTMLButtonElement>(".sheet-section-trigger");
          setActiveRest(null);
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

  const updateModuleVisibility = (sectionId: SheetLayoutSectionId, visible: boolean) => {
    edit((current) => ({
      ...current,
      sheetModuleVisibility: setSheetModuleVisibility(current.sheetModuleVisibility, sectionId, visible),
    }));
  };

  const resetLayout = () => {
    edit((current) => ({ ...current, sheetLayoutOrder: [], sheetModuleVisibility: {} }));
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
  const moduleVisibility = normalizeSheetModuleVisibility(sheet.sheetModuleVisibility);
  const moduleIsAvailable = (id: SheetLayoutSectionId) => hudModuleIsAvailable(id, { soulReaperAttached: Boolean(soulReaperProgression) });
  const customizableLayoutOrder = layoutOrder.filter(moduleIsAvailable);
  const passivePerception = 10 + skillModifier(sheet, "perception");
  const hpMaximum = Math.max(sheet.maxHp, 1);
  const hpPercent = Math.max(0, Math.min(100, Math.round((sheet.currentHp / hpMaximum) * 100)));
  const characterSubtitle = [
    character.ancestry,
    character.characterClass,
    `Level ${character.level}`,
  ].filter(Boolean).join(" / ");
  const conditionsSummary = conditionSummary(sheet.activeConditions, sheet.exhaustionLevel);
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

  const renderHudAbilityScores = () => (
    <div className="hud-ability-grid" aria-label="Ability scores">
      {abilityIds.map((ability) => {
        const score = sheet.abilityScores[ability] ?? 10;
        const modifier = formatModifier(abilityModifier(score));
        return <button
          aria-label={`Roll ${abilityFullLabels[ability]} check, modifier ${modifier}`}
          className="hud-ability-instrument"
          key={ability}
          onClick={() => rollNow(`${abilityFullLabels[ability]} check`, `d20${modifier}`, `hud-ability-${ability}`)}
          type="button"
        >
          <span className="hud-instrument-label">{abilityFullLabels[ability]}</span>
          <span aria-hidden="true" className="hud-ability-geometry">
            <svg viewBox="0 0 100 100"><polygon points="50,8 91,77 9,77" /><polygon points="50,92 9,23 91,23" /></svg>
            <strong>{modifier}</strong>
          </span>
          <small>Score {score}</small>
          <InlineRollFeedback result={inlineRolls[`hud-ability-${ability}`]} />
        </button>;
      })}
    </div>
  );

  const renderHudSavingThrows = () => (
    <div className="hud-save-list" aria-label="Saving throws">
      {abilityIds.map((ability) => {
        const proficient = sheet.savingThrows[ability] ?? false;
        const modifier = abilityModifier(sheet.abilityScores[ability] ?? 10) + (proficient ? sheet.proficiencyBonus : 0);
        return <button
          aria-label={`Roll ${abilityFullLabels[ability]} saving throw, ${proficient ? "proficient" : "not proficient"}, modifier ${formatModifier(modifier)}`}
          className="hud-save-instrument"
          key={ability}
          onClick={() => rollNow(`${abilityFullLabels[ability]} save`, `d20${formatModifier(modifier)}`, `hud-save-${ability}`)}
          type="button"
        >
          <span>{abilityFullLabels[ability]}</span>
          <i aria-hidden="true" />
          <small>{proficient ? "Proficient" : "Untrained"}</small>
          <strong>{formatModifier(modifier)}</strong>
          <InlineRollFeedback result={inlineRolls[`hud-save-${ability}`]} />
        </button>;
      })}
    </div>
  );

  const renderHudSenses = () => (
    <div className="hud-sense-list" aria-label="Passive senses">
      <div><strong>{passivePerception}</strong><span>Passive Perception</span></div>
      <div><strong>{passiveInvestigation}</strong><span>Passive Investigation</span></div>
      <div><strong>{passiveInsight}</strong><span>Passive Insight</span></div>
      {sheet.customSenses.trim() && <p>{sheet.customSenses}</p>}
    </div>
  );

  const updateCondition = (conditionId: ConditionId, active: boolean) => {
    edit((current) => ({
      ...current,
      activeConditions: active
        ? [...new Set([...current.activeConditions, conditionId])]
        : current.activeConditions.filter((id) => id !== conditionId),
    }));
  };

  const renderConditionsDetail = () => (
    <div className="conditions-selector">
      <div className="module-summary">
        <span>Active summary</span>
        <strong aria-live="polite">{conditionsSummary}</strong>
        <small>Changes are saved only for {character.name}.</small>
      </div>
      <div className="condition-option-list">
        {conditionDefinitions.map((condition) => <details className={sheet.activeConditions.includes(condition.id) ? "condition-option active" : "condition-option"} key={condition.id}>
          <summary>
            <label>
              <input checked={sheet.activeConditions.includes(condition.id)} onChange={(event) => updateCondition(condition.id, event.target.checked)} type="checkbox" />
              <strong>{condition.label}</strong>
            </label>
            <span>Rules</span>
          </summary>
          <p>{condition.summary}</p>
        </details>)}
      </div>
      <label className="form-field condition-exhaustion"><span>Exhaustion level</span><select onChange={(event) => edit((current) => ({ ...current, exhaustionLevel: Number(event.target.value) }))} value={sheet.exhaustionLevel}>{Array.from({ length: 7 }, (_, level) => <option key={level} value={level}>{level === 0 ? "None" : `Level ${level}`}</option>)}</select></label>
      <button className="secondary-button" disabled={!sheet.activeConditions.length && sheet.exhaustionLevel === 0} onClick={() => edit((current) => ({ ...current, activeConditions: [], exhaustionLevel: 0 }))} type="button">Clear all conditions</button>
    </div>
  );

  const renderRestReview = (rest: RestKind) => {
    const preview = buildHudRestPreview(sheet, rest);
    return <div className="rest-review">
      <div className="module-summary">
        <span>Recovery preview</span>
        <strong>{restLabels[rest]}</strong>
        <small>Nothing changes until you confirm.</small>
      </div>
      <div className="rest-preview-list">
        {preview.map((effect) => <div className={effect.changes ? "rest-preview-item changing" : "rest-preview-item"} key={effect.id}>
          <span><strong>{effect.label}</strong><small>{effect.changes ? "Will recover" : "No automatic change"}</small></span>
          <span className="rest-preview-values"><b>{effect.before}</b><i aria-hidden="true">→</i><b>{effect.after}</b></span>
          {effect.note && <p>{effect.note}</p>}
        </div>)}
      </div>
      <div className="rest-review-actions">
        <button className="secondary-button" onClick={closeModuleOverlay} type="button">Cancel</button>
        <button className="primary-button" onClick={confirmRest} type="button">Confirm {restLabels[rest]}</button>
      </div>
    </div>;
  };

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
        <strong>{customizeLayout ? "HUD customization is on" : "Customize the Live HUD"}</strong>
        <small>Show, hide, and reorder Home Screen modules. The Character Menu always keeps every module available.</small>
      </div>
      <div className="layout-customize-actions">
        <button className={customizeLayout ? "primary-button" : "secondary-button"} onClick={() => customizeLayout ? setCustomizeLayout(false) : openLayoutCustomizer()} type="button">{customizeLayout ? "Done editing" : "Start customizing"}</button>
        <button className="secondary-button" onClick={resetLayout} type="button">Restore Default Layout</button>
      </div>
    </div>
  );

  const renderModuleDetail = (id: SheetLayoutSectionId) => {
    switch (id) {
      case "armor-class":
      case "initiative":
      case "vitals":
        return renderModuleDetail("health-combat");
      case "conditions":
        return renderConditionsDetail();
      case "inspiration":
        return <div className="inspiration-detail">
          <div className="module-summary"><span>Heroic Inspiration</span><strong>{sheet.heroicInspiration ? "Ready" : "Used"}</strong><small>This state belongs to {character.name}.</small></div>
          <button aria-pressed={sheet.heroicInspiration} className={sheet.heroicInspiration ? "primary-button" : "secondary-button"} onClick={() => edit((current) => ({ ...current, heroicInspiration: !current.heroicInspiration }))} type="button">Mark {sheet.heroicInspiration ? "Used" : "Ready"}</button>
        </div>;
      case "abilities":
        return renderAbilitiesSavesSensesDetail();
      case "saving-throws":
        return renderSavingThrowsPanel();
      case "senses":
        return <div className="senses-detail">{renderHudSenses()}<label className="form-field full-width"><span>Other senses</span><textarea onChange={(event) => edit((current) => ({ ...current, customSenses: event.target.value }))} placeholder="Darkvision 60 ft., tremorsense, or another stored sense" rows={4} value={sheet.customSenses} /></label></div>;
      case "skills":
        return renderSkillsPanel({ expanded: true });
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
      case "book":
        return renderBookDetail();
      case "layout":
        return renderLayoutDetail();
      case "portrait":
        return <CharacterPortraitField
          characterName={character.name}
          imageId={character.portraitImageId}
          label="Portrait"
          onChange={(portrait) => updateCharacterField({ portraitDataUrl: portrait.imageDataUrl, portraitImageId: portrait.imageId, portraitTransform: portrait.transform })}
          suppressed={suppressPortrait}
          transform={character.portraitTransform}
          value={character.portraitDataUrl ?? ""}
        />;
      case "dashboard":
        return null;
    }
  };

  const openModuleOverlay = (id: SheetNavigatorSectionId) => {
    moduleReturnFocusRef.current = false;
    overlayReturnElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveRest(null);
    setActiveModuleId(id);
  };

  const layoutProps = (id: SheetLayoutSectionId) => ({
    id,
    style: { order: layoutOrder.indexOf(id) },
    visible: moduleVisibility[id] && moduleIsAvailable(id),
  });

  return (
    <section className={customizeLayout ? "page sheet-page layout-editing" : "page sheet-page"}>
      <header className="hud-page-masthead" id="sheet-section-dashboard" tabIndex={-1}>
        <div><span className="eyebrow">Character Vault</span><h1>Live HUD</h1><p>Favorite tools for {character.name}. The floating Character Menu always keeps everything available.</p></div>
        <div className="hud-page-actions">
          <span className="hud-save-state">{status}</span>
          <button className={customizeLayout ? "primary-button compact" : "secondary-button compact"} data-testid="customize-layout-button" onClick={() => customizeLayout ? setCustomizeLayout(false) : openLayoutCustomizer()} type="button">{customizeLayout ? "Done" : "Customize Layout"}</button>
        </div>
      </header>

      <CharacterHud character={character} items={characterMenuItems} onSelectMenuItem={(item) => void handleCharacterMenuItem(item)} />

      {switchAnnouncement && <p aria-live="polite" className="character-switch-toast" role="status">{switchAnnouncement}</p>}
      {menuActionError && <p aria-live="assertive" className="panel inline-message tool-status" role="alert">{menuActionError}</p>}

      {quickRoll && <p className="panel inline-message tool-status" role="status">{quickRoll}</p>}

      {customizeLayout && <div className="layout-customize-bar" id="sheet-layout-customizer" tabIndex={-1}>
        <div>
          <span className="card-label">Editing layout</span>
          <h2>Show, hide, and reorder this character's HUD</h2>
          <p>Use each checkbox to choose Home Screen favorites. Drag modules or use Move up and Move down for precise control. Hidden modules remain in the Character Menu and keep all their data.</p>
        </div>
        <div className="layout-customize-actions">
          <button className="secondary-button compact" onClick={resetLayout} type="button">Restore Default Layout</button>
          <button className="primary-button compact" onClick={() => setCustomizeLayout(false)} type="button">Done</button>
        </div>
        <LayoutCustomizerList
          draggingId={draggingSectionId}
          onDragEnd={endLayoutDrag}
          onDragMove={moveLayoutDrag}
          onDragStart={startLayoutDrag}
          onMove={moveLayoutCard}
          onVisibilityChange={updateModuleVisibility}
          order={customizableLayoutOrder}
          visibility={moduleVisibility}
        />
      </div>}

      <div className={customizeLayout ? "live-hud-canvas customizing" : "live-hud-canvas"} aria-label="Character live HUD">
      <LayoutCard {...layoutProps("identity")}>
        <section className="hud-module hud-identity-module" aria-labelledby="sheet-character-title">
          <CharacterPortraitField
            characterName={character.name}
            compact
            imageId={character.portraitImageId}
            label="Portrait"
            onChange={(portrait) => updateCharacterField({ portraitDataUrl: portrait.imageDataUrl, portraitImageId: portrait.imageId, portraitTransform: portrait.transform })}
            suppressed={suppressPortrait}
            transform={character.portraitTransform}
            value={character.portraitDataUrl ?? ""}
          />
          <div className="hud-identity-copy"><span className="card-label">Active character</span><h2 id="sheet-character-title">{character.name}</h2><p>{characterSubtitle || "Touch-friendly live play sheet"}</p><small>{character.campaign || "No campaign set"}</small></div>
          <button className="hud-module-link" onClick={() => openModuleOverlay("identity")} type="button">Edit identity</button>
        </section>
      </LayoutCard>

      <LayoutCard {...layoutProps("armor-class")}>
        <button className="hud-module hud-orb-module" onClick={() => openModuleOverlay("armor-class")} type="button"><span>Armor Class</span><strong>{sheet.armorClass}</strong><small>Defense</small></button>
      </LayoutCard>

      <LayoutCard {...layoutProps("initiative")}>
        <button className="hud-module hud-orb-module" onClick={() => initiativeRow ? rollNow("Initiative", initiativeRow.formula, "hud-initiative") : openModuleOverlay("initiative")} type="button"><span>Initiative</span><strong>{formatModifier(initiativeModifier)}</strong><small>{initiativeRow ? "Tap to roll" : "Edit combat"}</small><InlineRollFeedback result={inlineRolls["hud-initiative"]} /></button>
      </LayoutCard>

      <LayoutCard {...layoutProps("health-combat")}>
        <section className="hud-module hud-health-module" aria-labelledby="hud-health-title">
          <button className="hud-health-primary" onClick={() => openModuleOverlay("health-combat")} type="button"><span id="hud-health-title">Hit Points</span><strong>{sheet.currentHp}<small> / {sheet.maxHp}</small></strong><em>{sheet.temporaryHp} Temporary</em><i aria-hidden="true"><b style={{ width: `${hpPercent}%` }} /></i></button>
          <div className="hud-rest-actions"><button className="secondary-button compact" onClick={() => openRest("shortRest")} type="button">Short Rest</button><button className="primary-button compact" onClick={() => openRest("longRest")} type="button">Long Rest</button></div>
        </section>
      </LayoutCard>

      <LayoutCard {...layoutProps("conditions")}>
        <button className="hud-module hud-conditions-module" onClick={() => openModuleOverlay("conditions")} type="button"><span>Conditions</span><strong>{conditionsSummary}</strong><small>{sheet.activeConditions.length || sheet.exhaustionLevel ? "Tap to manage" : "No active conditions"}</small></button>
      </LayoutCard>

      <LayoutCard {...layoutProps("inspiration")}>
        <button aria-pressed={sheet.heroicInspiration} className={sheet.heroicInspiration ? "hud-module hud-inspiration-module ready" : "hud-module hud-inspiration-module"} onClick={() => edit((current) => ({ ...current, heroicInspiration: !current.heroicInspiration }))} type="button"><span>Heroic Inspiration</span><strong>{sheet.heroicInspiration ? "Ready" : "Used"}</strong><small>Tap to toggle</small></button>
      </LayoutCard>

      <LayoutCard {...layoutProps("vitals")}>
        <section className="hud-module hud-vitals-module" aria-label="Speed, hit dice, and death saves">
          <button onClick={() => openModuleOverlay("vitals")} type="button"><span>Speed</span><strong>{sheet.speed}</strong><small>feet</small></button>
          <button className={!sheet.hitDice.trim() ? "needs-attention" : ""} onClick={() => openModuleOverlay("vitals")} type="button"><span>Hit Dice</span><strong>{sheet.hitDice || "Unset"}</strong><small>{sheet.hitDice ? "Rest resource" : "Tap to set"}</small></button>
          <div className="hud-death-saves"><span>Death Saves</span><div><strong>Successes</strong>{[1, 2, 3].map((value) => <button aria-label={`Set death save successes to ${value}`} aria-pressed={sheet.deathSaveSuccesses >= value} key={`success-${value}`} onClick={() => edit((current) => ({ ...current, deathSaveSuccesses: current.deathSaveSuccesses === value ? value - 1 : value }))} type="button">{value}</button>)}</div><div><strong>Failures</strong>{[1, 2, 3].map((value) => <button aria-label={`Set death save failures to ${value}`} aria-pressed={sheet.deathSaveFailures >= value} key={`failure-${value}`} onClick={() => edit((current) => ({ ...current, deathSaveFailures: current.deathSaveFailures === value ? value - 1 : value }))} type="button">{value}</button>)}</div></div>
        </section>
      </LayoutCard>

      <LayoutCard {...layoutProps("abilities")}>
        <section className="hud-module hud-abilities-module"><header><div><span className="card-label">Ability Scores</span><h2>Core checks</h2></div><button className="hud-module-link" onClick={() => openModuleOverlay("abilities")} type="button">Edit scores</button></header>{renderHudAbilityScores()}</section>
      </LayoutCard>

      <LayoutCard {...layoutProps("saving-throws")}>
        <section className="hud-module hud-saves-module"><header><div><span className="card-label">Saving Throws</span><h2>{activeSaveCount} proficient</h2></div><button className="hud-module-link" onClick={() => openModuleOverlay("saving-throws")} type="button">Edit</button></header>{renderHudSavingThrows()}</section>
      </LayoutCard>

      <LayoutCard {...layoutProps("senses")}>
        <section className="hud-module hud-senses-module"><header><div><span className="card-label">Senses</span><h2>Passive awareness</h2></div><button className="hud-module-link" onClick={() => openModuleOverlay("senses")} type="button">Edit</button></header>{renderHudSenses()}</section>
      </LayoutCard>

      <LayoutCard {...layoutProps("skills")}>
        <GameplayCard eyebrow="Checks" title="Skills" summary={<div className="module-summary"><span>{activeSkillCount} proficient</span><strong>Perception {formatModifier(skillModifier(sheet, "perception"))}</strong><small>Insight {formatModifier(skillModifier(sheet, "insight"))} · Investigation {formatModifier(skillModifier(sheet, "investigation"))}</small></div>} onOpenDetails={() => openModuleOverlay("skills")} />
      </LayoutCard>

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
        actions={<a className="secondary-button compact button-link" href={characterMenuRouteHash("spellbook", characterId)}>Full spellbook</a>}
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

      {(activeModuleId || activeRest) && <div className="module-overlay" onMouseDown={closeModuleOverlay} role="presentation">
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
              <h2 id="module-overlay-title">{activeRest ? restLabels[activeRest] : activeModuleId ? overlaySectionTitles[activeModuleId] : "Live HUD"}</h2>
            </div>
            <button aria-label="Close module" autoFocus className="module-overlay-close" onClick={closeModuleOverlay} type="button">X</button>
          </div>
          <div className="module-overlay-body">
            {activeRest ? renderRestReview(activeRest) : activeModuleId ? renderOverlayDetail(activeModuleId) : null}
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
    </section>
  );
}
