import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { SourceBadge } from "../../components/SourceBadge";
import type { CharacterSheet, Spell } from "../../domain/models";
import { formatModifier } from "../../domain/dndMath";
import { addRollToHistory, rollFormula, type DiceRollResult } from "../../dice/dice";
import {
  canCastSpellWithSlot,
  consumeSpellSlot,
  isSpellPrepared,
  spellAttackModifier,
  spellComponents,
  spellRollOptions,
  spellSaveDifficulty,
  spellSlotSummary,
  spellcastingAbilityModifier,
  validSpellSlotLevels,
} from "../../rules/spellCasting";

type SpellDetailOverlayProps = {
  editContent?: ReactNode;
  onActivity?: (message: string) => void;
  onClose: () => void;
  onSheetChange: (nextSheet: CharacterSheet) => Promise<void> | void;
  sheet: CharacterSheet;
  spell: Spell;
};

const focusableOverlaySelector = "button, [href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";

function levelLabel(level: number) {
  return level === 0 ? "Cantrip" : `Level ${level}`;
}

function abilityLabel(ability: CharacterSheet["spellcastingAbility"]) {
  return ability ? ability.toUpperCase() : "Unset";
}

function rollResultSummary(result: DiceRollResult) {
  return `${result.total} (${result.breakdown})`;
}

export function SpellDetailOverlay({ editContent, onActivity, onClose, onSheetChange, sheet, spell }: SpellDetailOverlayProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [selectedSlotLevel, setSelectedSlotLevel] = useState<number | null>(null);
  const [rollResults, setRollResults] = useState<Record<string, DiceRollResult>>({});
  const [history, setHistory] = useState<DiceRollResult[]>([]);
  const [message, setMessage] = useState("");

  const validSlots = useMemo(() => validSpellSlotLevels(sheet, spell), [sheet, spell]);
  const rollOptions = useMemo(() => spellRollOptions(spell, sheet), [sheet, spell]);
  const prepared = isSpellPrepared(sheet, spell);
  const spellSaveDc = spellSaveDifficulty(sheet);
  const spellAttack = spellAttackModifier(sheet);
  const castingModifier = spellcastingAbilityModifier(sheet);
  const canCast = spell.level === 0 || canCastSpellWithSlot(sheet, spell, selectedSlotLevel);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (spell.level === 0) {
      setSelectedSlotLevel(null);
      return;
    }
    setSelectedSlotLevel((current) => current && validSlots.includes(current) ? current : validSlots[0] ?? null);
  }, [spell.id, spell.level, validSlots.join(",")]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>(focusableOverlaySelector)?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableOverlaySelector) ?? []);
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

  const recordRoll = (label: string, formula: string, id: string) => {
    try {
      const rolled = rollFormula(formula);
      setRollResults((current) => ({ ...current, [id]: rolled }));
      setHistory((current) => addRollToHistory(current, rolled));
      const nextMessage = `${label}: ${rolled.breakdown}`;
      setMessage(nextMessage);
      onActivity?.(nextMessage);
      return rolled;
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Could not roll that spell formula";
      setMessage(nextMessage);
      onActivity?.(nextMessage);
      return null;
    }
  };

  const castSpell = async () => {
    if (!canCast) return;
    if (spell.level > 0 && !window.confirm(`Cast ${spell.name} using a Level ${selectedSlotLevel} slot?`)) return;

    const rolled = rollOptions.map((option) => recordRoll(option.label, option.formula, option.id)).filter(Boolean);
    if (spell.level > 0) await onSheetChange(consumeSpellSlot(sheet, spell, selectedSlotLevel));
    const slotText = spell.level === 0 ? "No spell slot spent." : `Level ${selectedSlotLevel} slot spent.`;
    const nextMessage = `Cast ${spell.name}. ${slotText}${rolled.length ? ` ${rolled.length} roll${rolled.length === 1 ? "" : "s"} recorded.` : ""}`;
    setMessage(nextMessage);
    onActivity?.(nextMessage);
  };

  return (
    <div className="spell-detail-overlay" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="spell-detail-title"
        aria-modal="true"
        className="spell-detail-dialog"
        onKeyDown={trapFocus}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header className="spell-detail-header">
          <div>
            <span className="card-label">{levelLabel(spell.level)} · {spell.school}</span>
            <h2 id="spell-detail-title">{spell.name}</h2>
            <div className="spell-detail-tags">
              <SourceBadge source={spell.source} />
              <span>{prepared ? "Prepared" : spell.level === 0 ? "Known cantrip" : "Not marked prepared"}</span>
              {spell.concentration && <span>Concentration</span>}
              {spell.ritual && <span>Ritual</span>}
            </div>
          </div>
          <button aria-label={`Close ${spell.name} details`} className="module-overlay-close" onClick={onClose} type="button">X</button>
        </header>

        <div className="spell-detail-body">
          <section className="spell-cast-panel">
            <div className="spell-cast-primary">
              <div>
                <span className="card-label">Cast spell</span>
                <strong>{spell.level === 0 ? "Cantrip" : selectedSlotLevel ? `Level ${selectedSlotLevel} slot selected` : "No valid slot available"}</strong>
                <small>{spell.level === 0 ? "Cantrips do not spend slots." : "Choose the slot level before casting."}</small>
              </div>
              <button className="primary-button" disabled={!canCast} onClick={() => void castSpell()} type="button">{spell.level === 0 ? "Cast Cantrip" : "Cast"}</button>
            </div>
            {spell.level > 0 && <div className="spell-slot-choice-grid" aria-label="Slot level choice">
              {Array.from({ length: 10 - spell.level }, (_, index) => spell.level + index).map((level) => {
                const summary = spellSlotSummary(sheet, level);
                const disabled = summary.remaining <= 0;
                return <button className={selectedSlotLevel === level ? "slot-choice active" : "slot-choice"} disabled={disabled} key={level} onClick={() => setSelectedSlotLevel(level)} type="button"><strong>L{level}</strong><span>{summary.remaining}/{summary.maximum} left</span></button>;
              })}
            </div>}
            {!canCast && <p className="inline-message" role="status">No valid spell slot remains for this spell.</p>}
            {message && <p className="inline-message" role="status">{message}</p>}
          </section>

          <section className="spell-detail-grid" aria-label="Spell details">
            <div><span>Casting time</span><strong>{spell.castingTime}</strong></div>
            <div><span>Range</span><strong>{spell.range}</strong></div>
            <div><span>Components</span><strong>{spellComponents(spell)}</strong></div>
            <div><span>Duration</span><strong>{spell.duration}</strong></div>
            <div><span>Spell attack</span><strong>{formatModifier(spellAttack)}</strong></div>
            <div><span>Save DC</span><strong>{spellSaveDc || "Unset"}</strong></div>
            <div><span>Ability</span><strong>{abilityLabel(sheet.spellcastingAbility)} {formatModifier(castingModifier)}</strong></div>
            <div><span>Proficiency</span><strong>{formatModifier(sheet.proficiencyBonus)}</strong></div>
          </section>

          {spell.materialDetails && <section className="spell-text-panel"><span className="card-label">Materials</span><p>{spell.materialDetails}</p></section>}

          {rollOptions.length > 0 && <section className="spell-roll-panel">
            <div className="form-section-heading"><div><span className="card-label">Built-in rolls</span><h3>Spell dice</h3></div></div>
            <div className="spell-roll-grid">
              {rollOptions.map((option) => <article className={`spell-roll-card ${option.kind}`} key={option.id}>
                <div><strong>{option.label}</strong><span>{option.formula}</span><small>{option.source}</small></div>
                <button className="secondary-button compact" onClick={() => recordRoll(option.label, option.formula, option.id)} type="button">Roll</button>
                {rollResults[option.id] && <div className="dice-result compact-roll-result" role="status"><strong>{rollResults[option.id].total}</strong><span>{rollResultSummary(rollResults[option.id])}</span><small>Formula: {rollResults[option.id].formula}</small></div>}
              </article>)}
            </div>
          </section>}

          <section className="spell-text-panel"><span className="card-label">Description</span><p>{spell.description || "No description saved yet."}</p></section>
          {spell.higherLevelScaling && <section className="spell-text-panel"><span className="card-label">At higher levels</span><p>{spell.higherLevelScaling}</p></section>}
          {spell.statusEffects && <section className="spell-text-panel"><span className="card-label">Effects</span><p>{spell.statusEffects}</p></section>}
          {spell.sourceNotes && <section className="spell-text-panel"><span className="card-label">Source / class notes</span><p>{spell.sourceNotes}</p></section>}

          {history.length > 0 && <details className="dice-history spell-cast-history"><summary>Roll / cast history</summary><ol>{history.map((roll) => <li key={roll.id}><strong>{roll.formula}</strong> {roll.breakdown}</li>)}</ol></details>}
          {editContent && <details className="spell-edit-details"><summary>Edit spell data</summary>{editContent}</details>}
        </div>
      </section>
    </div>
  );
}
