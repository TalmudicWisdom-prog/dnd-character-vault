import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { SourceBadge } from "../../components/SourceBadge";
import type { CharacterSheet, Spell } from "../../domain/models";
import { formatModifier } from "../../domain/dndMath";
import { addRollToHistory, rollFormula, type DiceRollResult } from "../../dice/dice";
import {
  canCastSpell,
  consumeSpellSlot,
  isSpellPrepared,
  spellComponents,
  spellRollOptions,
  spellDetailStatistics,
  validSpellSlotChoices,
  type SpellSlotChoice,
} from "../../rules/spellCasting";
import { remainingSpellSlots } from "../../rules/spellSlots";

type SpellDetailOverlayProps = {
  catalog?: {
    classes: string[];
    sourceChoices: Array<{ value: string; label: string }>;
    sourceClass: string;
    complete: boolean;
    displayLevel: string;
    rulesSourceId: string;
    contentSourceId: string;
    definitionPage: number | null;
    associationPage: number | null;
    owned: boolean;
    onAdd: () => void;
    onCompleteAndAdd?: () => void;
    onAddReferenceOnly?: () => void;
    onSourceClassChange: (sourceClass: string) => void;
    onViewOwned?: () => void;
  };
  editContent?: ReactNode;
  editorOpen?: boolean;
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

function actionTypeLabel(actionType: Spell["actionType"]) {
  return ({ action: "Action", bonusAction: "Bonus action", reaction: "Reaction", minute: "Minute+", hour: "Hour+", special: "Special" })[actionType];
}

const abilityNames = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" } as const;

function abilityLabel(ability: CharacterSheet["spellcastingAbility"]) {
  return ability ? abilityNames[ability] : "";
}

function rollResultSummary(result: DiceRollResult) {
  return `${result.total} (${result.breakdown})`;
}

function slotChoiceKey(choice: SpellSlotChoice) {
  return `${choice.pool}-${choice.level}`;
}

function slotChoiceLabel(choice: SpellSlotChoice) {
  return choice.pool === "pactMagic" ? `Pact L${choice.level}` : `L${choice.level}`;
}

function slotChoiceSummary(sheet: CharacterSheet, choice: SpellSlotChoice) {
  const maximum = choice.pool === "pactMagic" ? sheet.pactMagicSlots[String(choice.level)] ?? 0 : sheet.spellSlots[String(choice.level)] ?? 0;
  const used = choice.pool === "pactMagic" ? sheet.pactMagicSlotsUsed[String(choice.level)] ?? 0 : sheet.spellSlotsUsed[String(choice.level)] ?? 0;
  return { maximum, used, remaining: remainingSpellSlots(maximum, used) };
}

export function SpellDetailOverlay({ catalog, editContent, editorOpen = false, onActivity, onClose, onSheetChange, sheet, spell }: SpellDetailOverlayProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [selectedSlotChoice, setSelectedSlotChoice] = useState<SpellSlotChoice | null>(null);
  const [rollResults, setRollResults] = useState<Record<string, DiceRollResult>>({});
  const [history, setHistory] = useState<DiceRollResult[]>([]);
  const [message, setMessage] = useState("");

  const validSlots = useMemo(() => validSpellSlotChoices(sheet, spell), [sheet, spell]);
  const visibleSlotChoices = useMemo(() => {
    if (spell.level === 0) return [];
    return Array.from({ length: 10 - spell.level }, (_, index) => spell.level + index).flatMap((level) => ([
      { pool: "spellSlots", level } as SpellSlotChoice,
      { pool: "pactMagic", level } as SpellSlotChoice,
    ])).filter((choice) => slotChoiceSummary(sheet, choice).maximum > 0);
  }, [sheet, spell]);
  const detailStatistics = spellDetailStatistics(spell, sheet);
  const resolvedAbility = detailStatistics.ability;
  const castingSheet = useMemo(() => ({ ...sheet, spellcastingAbility: resolvedAbility }), [sheet, resolvedAbility]);
  const rollOptions = useMemo(() => spellRollOptions(spell, castingSheet), [castingSheet, spell]);
  const prepared = isSpellPrepared(sheet, spell);
  const spellSaveDc = detailStatistics.saveDc;
  const spellAttack = detailStatistics.spellAttack;
  const castingModifier = detailStatistics.abilityModifier;
  const needsCastingSetup = detailStatistics.setupWarning;
  const canCast = canCastSpell(sheet, spell, selectedSlotChoice);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (spell.level === 0) {
      setSelectedSlotChoice(null);
      return;
    }
    setSelectedSlotChoice((current) => current && validSlots.some((slot) => slotChoiceKey(slot) === slotChoiceKey(current)) ? current : validSlots[0] ?? null);
  }, [spell.id, spell.level, validSlots.map(slotChoiceKey).join(",")]);

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
    if (spell.level > 0 && !window.confirm(`Cast ${spell.name} using ${selectedSlotChoice ? slotChoiceLabel(selectedSlotChoice) : "a spell"} slot?`)) return;

    const rolled = rollOptions.map((option) => recordRoll(option.label, option.formula, option.id)).filter(Boolean);
    if (spell.level > 0) await onSheetChange(consumeSpellSlot(sheet, spell, selectedSlotChoice));
    const slotText = spell.level === 0 ? "No spell slot spent." : `${selectedSlotChoice ? slotChoiceLabel(selectedSlotChoice) : "Spell"} slot spent.`;
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
            <span className="card-label">{catalog?.displayLevel ?? levelLabel(spell.level)} · {spell.school}</span>
            <h2 id="spell-detail-title">{spell.name}</h2>
            <div className="spell-detail-tags">
              <SourceBadge source={catalog?.rulesSourceId || spell.rulesSourceId || spell.source} />
              {(catalog?.contentSourceId || spell.contentSourceId) && (catalog?.contentSourceId || spell.contentSourceId) !== (catalog?.rulesSourceId || spell.rulesSourceId) && <SourceBadge source={catalog?.contentSourceId || spell.contentSourceId} />}
              <span>{catalog ? "Catalog spell" : prepared ? "Prepared" : spell.level === 0 ? "Known cantrip" : "Not marked prepared"}</span>
              {spell.concentration && <span title="The caster must maintain focus and normally can concentrate on only one spell at a time.">Concentration</span>}
              {spell.ritual && <span title="Eligible casters may cast it as a ritual when their rules allow.">Ritual</span>}
            </div>
          </div>
          <button aria-label={`Close ${spell.name} details`} className="module-overlay-close" onClick={onClose} type="button">X</button>
        </header>

        <div className="spell-detail-body">
          {catalog ? <section className={`spell-cast-panel catalog-add-panel${catalog.complete ? "" : " incomplete-definition-panel"}`}>
            <div className="spell-cast-primary">
              <div><span className="card-label">Add from Spell Catalog</span><strong>{!catalog.complete ? catalog.owned ? "Already owned as a local reference" : "Definition unavailable" : catalog.owned ? "Already owned" : "Choose the class granting this spell"}</strong><small>{!catalog.complete ? catalog.owned ? "This character owns a local reference or completed custom definition linked to this FFXIV catalog entry." : "The guide lists this spell by name and association, but not complete rules. Keep the reference local, or supply your own rules without changing the source pack." : catalog.owned ? "This character already has this stable catalog definition." : "The selected class determines the spellcasting ability and content-source association."}</small></div>
              {!catalog.complete ? catalog.owned ? (catalog.onViewOwned ? <button className="secondary-button" onClick={catalog.onViewOwned} type="button">View owned spell</button> : <button className="secondary-button" onClick={onClose} type="button">Close</button>) : <div className="catalog-incomplete-actions"><button className="primary-button" disabled={!catalog.sourceClass} onClick={catalog.onCompleteAndAdd} type="button">Complete &amp; Add</button><button className="secondary-button" disabled={!catalog.sourceClass} onClick={catalog.onAddReferenceOnly} type="button">Add as reference only</button><button className="text-button" onClick={onClose} type="button">Close</button></div> : catalog.owned ? (catalog.onViewOwned ? <button className="secondary-button" onClick={catalog.onViewOwned} type="button">View owned spell</button> : <button className="secondary-button" onClick={onClose} type="button">Close</button>) : <button className="primary-button" disabled={!catalog.sourceClass} onClick={catalog.onAdd} type="button">Add Spell</button>}
            </div>
            {!catalog.owned && <label className="form-field catalog-source-class"><span>Source class</span><select aria-label={`Source class for ${spell.name}`} onChange={(event) => catalog.onSourceClassChange(event.target.value)} value={catalog.sourceClass}><option value="">Choose class</option>{catalog.sourceChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>}
          </section> : !spell.rulesComplete ? <section className="spell-cast-panel incomplete-definition-panel"><div><span className="card-label">Rules incomplete</span><strong>Complete the required spell data before casting</strong><small>{spell.referenceDefinitionId ? "This is a local reference-only spell linked to the FFXIV catalog. Its name, level, source, pages, and chosen class are preserved below." : "Add a school, casting time, range, duration, and full description in the editor below."}</small></div></section> : <section className="spell-cast-panel">
            <div className="spell-cast-primary">
              <div>
                <span className="card-label">Cast spell</span>
                <strong>{spell.level === 0 ? "Cantrip" : selectedSlotChoice ? `${slotChoiceLabel(selectedSlotChoice)} slot selected` : "No valid slot available"}</strong>
                <small>{spell.level === 0 ? "Cantrips do not spend slots." : "Choose the slot level before casting."}</small>
              </div>
              <button className="primary-button" disabled={!canCast} onClick={() => void castSpell()} type="button">{spell.level === 0 ? "Cast Cantrip" : "Cast"}</button>
            </div>
            {spell.level > 0 && <div className="spell-slot-choice-grid" aria-label="Slot level choice">
              {visibleSlotChoices.map((choice) => {
                const summary = slotChoiceSummary(sheet, choice);
                const disabled = summary.remaining <= 0;
                return <button className={selectedSlotChoice && slotChoiceKey(selectedSlotChoice) === slotChoiceKey(choice) ? "slot-choice active" : "slot-choice"} disabled={disabled} key={slotChoiceKey(choice)} onClick={() => setSelectedSlotChoice(choice)} type="button"><strong>{slotChoiceLabel(choice)}</strong><span>{summary.remaining}/{summary.maximum} left</span></button>;
              })}
            </div>}
            {!canCast && <p className="inline-message" role="status">No valid spell slot remains for this spell.</p>}
            {message && <p className="inline-message" role="status">{message}</p>}
          </section>}

          {(!catalog || catalog.complete) && spell.rulesComplete && <section className="spell-detail-grid" aria-label="Spell details">
            <div><span>Casting time</span><strong>{spell.castingTime}</strong></div>
            <div><span>Action type</span><strong>{actionTypeLabel(spell.actionType)}</strong></div>
            <div><span>Range</span><strong>{spell.range}</strong></div>
            <div><span>Components</span><strong className="component-abbreviations">{spell.verbalComponent && <abbr title="Verbal: the caster must speak magical words.">V</abbr>}{spell.somaticComponent && <abbr title="Somatic: the caster must perform gestures.">S</abbr>}{spell.materialComponent && <abbr title="Material: the spell requires a material component or spellcasting focus, subject to its rules.">M</abbr>}{spellComponents(spell) === "None" && "None"}</strong></div>
            <div><span>Duration</span><strong>{spell.duration}</strong></div>
            {spellAttack !== null && <div><span title="The modifier added to the caster's spell-attack roll.">Spell Attack</span><strong>{formatModifier(spellAttack)}</strong></div>}
            {spellSaveDc !== null && <div><span title="The target number a creature must meet on its saving throw.">Save DC</span><strong>{spellSaveDc} · {abilityNames[spell.savingThrowType.toLocaleLowerCase() as keyof typeof abilityNames] ?? spell.savingThrowType} save</strong></div>}
            {resolvedAbility && castingModifier !== null && <div><span>Spellcasting Ability</span><strong>{abilityLabel(resolvedAbility)} {formatModifier(castingModifier)}</strong></div>}
            {(spell.attackRollRequired || spell.savingThrowType) && resolvedAbility && <div><span>Proficiency</span><strong>{formatModifier(sheet.proficiencyBonus)}</strong></div>}
          </section>}

          {needsCastingSetup && <p className="inline-message setup-warning" role="status">Choose the spell's source class or a casting ability override before using its spellcasting statistics.</p>}

          <details className="spell-rules-help"><summary>What do these spell terms mean?</summary><dl><dt>V - Verbal</dt><dd>The caster must speak magical words.</dd><dt>S - Somatic</dt><dd>The caster must perform gestures.</dd><dt>M - Material</dt><dd>The spell requires a material component or spellcasting focus, subject to its rules.</dd><dt>Concentration</dt><dd>The caster must maintain focus and normally can concentrate on only one spell at a time.</dd><dt>Ritual</dt><dd>Eligible casters may cast it as a ritual when their rules allow.</dd><dt>Save DC</dt><dd>The target number a creature must meet on its saving throw.</dd><dt>Spell Attack</dt><dd>The modifier added to the caster's spell-attack roll.</dd></dl></details>

          {spell.materialDetails && <section className="spell-text-panel"><span className="card-label">Materials</span><p>{spell.materialDetails}</p></section>}

          {catalog && <section className="spell-text-panel"><span className="card-label">Content source</span><p><SourceBadge source={catalog.contentSourceId} />{catalog.definitionPage ? ` Rules page ${catalog.definitionPage}.` : ""}{catalog.associationPage && catalog.associationPage !== catalog.definitionPage ? ` Class-list page ${catalog.associationPage}.` : ""} {!catalog.complete && "Rules data: Custom definition required."}</p></section>}

          {catalog && <section className="spell-text-panel"><span className="card-label">Available classes and subclasses</span><p>{catalog.classes.join(", ") || "No verified class association."}</p></section>}

          {!catalog && spell.referenceDefinitionId && <section className="spell-text-panel"><span className="card-label">FFXIV catalog reference</span><p><SourceBadge source={spell.contentSourceId || spell.rulesSourceId} /> Reference ID: {spell.referenceDefinitionId}. {spell.referenceSourcePages.length ? `Source pages: ${spell.referenceSourcePages.join(", ")}.` : ""} {spell.referenceClasses.length ? `Available classes: ${spell.referenceClasses.join(", ")}.` : ""}</p></section>}

          {!catalog && rollOptions.length > 0 && <section className="spell-roll-panel">
            <div className="form-section-heading"><div><span className="card-label">Built-in rolls</span><h3>Spell dice</h3></div></div>
            <div className="spell-roll-grid">
              {rollOptions.map((option) => <article className={`spell-roll-card ${option.kind}`} key={option.id}>
                <div><strong>{option.label}</strong><span>{option.formula}</span><small>{option.source}</small></div>
                <button className="secondary-button compact" onClick={() => recordRoll(option.label, option.formula, option.id)} type="button">Roll</button>
                {rollResults[option.id] && <div className="dice-result compact-roll-result" role="status"><strong>{rollResults[option.id].total}</strong><span>{rollResultSummary(rollResults[option.id])}</span><small>Formula: {rollResults[option.id].formula}</small></div>}
              </article>)}
            </div>
          </section>}

          <section className="spell-text-panel"><span className="card-label">Description</span><p>{catalog && !catalog.complete ? "Definition unavailable in the supplied guide. No rules text has been invented or fetched." : spell.description || "No description saved yet."}</p></section>
          {spell.higherLevelScaling && <section className="spell-text-panel"><span className="card-label">At higher levels</span><p>{spell.higherLevelScaling}</p></section>}
          {spell.statusEffects && <section className="spell-text-panel"><span className="card-label">Effects</span><p>{spell.statusEffects}</p></section>}
          {spell.sourceNotes && <section className="spell-text-panel"><span className="card-label">Source / class notes</span><p>{spell.sourceNotes}</p></section>}
          {spell.notes && <section className="spell-text-panel"><span className="card-label">Character notes</span><p>{spell.notes}</p></section>}

          {history.length > 0 && <details className="dice-history spell-cast-history"><summary>Roll / cast history</summary><ol>{history.map((roll) => <li key={roll.id}><strong>{roll.formula}</strong> {roll.breakdown}</li>)}</ol></details>}
          {editContent && <details className="spell-edit-details" open={editorOpen}><summary>{editorOpen ? "Complete FFXIV spell rules" : "Edit spell data"}</summary>{editContent}</details>}
        </div>
      </section>
    </div>
  );
}
