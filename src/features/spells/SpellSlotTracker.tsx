import type { CharacterSheet, ResourceRecoveryRule } from "../../domain/models";
import {
  changeSlotExpended,
  clampExpended,
  defaultRecoveryForPool,
  normalizeRecoveryRule,
  remainingSpellSlots,
  type SlotPoolId,
} from "../../rules/spellSlots";

type SpellSlotTrackerProps = {
  onChange: (nextSheet: CharacterSheet) => void | Promise<void>;
  sheet: CharacterSheet;
};

const slotLevels = Array.from({ length: 9 }, (_, index) => String(index + 1));
const recoveryLabels: Record<ResourceRecoveryRule["recoverOn"], string> = {
  shortRest: "Short Rest",
  longRest: "Long Rest",
  both: "Either Rest",
  manual: "Manual",
};

function poolValues(sheet: CharacterSheet, pool: SlotPoolId) {
  return pool === "pactMagic"
    ? { maximums: sheet.pactMagicSlots, used: sheet.pactMagicSlotsUsed, recovery: sheet.pactMagicRecovery, title: "Pact Magic", fallback: defaultRecoveryForPool("pactMagic").recoverOn }
    : { maximums: sheet.spellSlots, used: sheet.spellSlotsUsed, recovery: sheet.spellSlotRecovery, title: "Spell Slots", fallback: defaultRecoveryForPool("spellSlots").recoverOn };
}

function updatePool(sheet: CharacterSheet, pool: SlotPoolId, update: {
  maximums?: Record<string, number>;
  used?: Record<string, number>;
  recovery?: Record<string, ResourceRecoveryRule>;
}) {
  return pool === "pactMagic"
    ? {
        ...sheet,
        pactMagicSlots: update.maximums ?? sheet.pactMagicSlots,
        pactMagicSlotsUsed: update.used ?? sheet.pactMagicSlotsUsed,
        pactMagicRecovery: update.recovery ?? sheet.pactMagicRecovery,
      }
    : {
        ...sheet,
        spellSlots: update.maximums ?? sheet.spellSlots,
        spellSlotsUsed: update.used ?? sheet.spellSlotsUsed,
        spellSlotRecovery: update.recovery ?? sheet.spellSlotRecovery,
      };
}

function SlotPoolEditor({ onChange, pool, sheet }: SpellSlotTrackerProps & { pool: SlotPoolId }) {
  const values = poolValues(sheet, pool);

  const changeMaximum = (level: string, maximum: number) => {
    const nextMaximum = Math.max(0, Math.round(Number.isFinite(maximum) ? maximum : 0));
    void onChange(updatePool(sheet, pool, {
      maximums: { ...values.maximums, [level]: nextMaximum },
      used: { ...values.used, [level]: clampExpended(nextMaximum, values.used[level] ?? 0) },
    }));
  };

  const changeRecovery = (level: string, changes: Partial<ResourceRecoveryRule>) => {
    const current = normalizeRecoveryRule(values.recovery[level], values.fallback);
    void onChange(updatePool(sheet, pool, {
      recovery: {
        ...values.recovery,
        [level]: normalizeRecoveryRule({ ...current, ...changes }, values.fallback),
      },
    }));
  };

  return (
    <section className="slot-pool-panel">
      <div className="form-section-heading"><div><span className="card-label">{pool === "pactMagic" ? "Short-rest pool" : "Long-rest pool"}</span><h3>{values.title}</h3></div></div>
      <div className="spell-slot-tracker enhanced-slot-tracker">
        {slotLevels.map((level) => {
          const maximum = values.maximums[level] ?? 0;
          const expended = clampExpended(maximum, values.used[level] ?? 0);
          const remaining = remainingSpellSlots(maximum, expended);
          const recovery = normalizeRecoveryRule(values.recovery[level], values.fallback);
          return <article className="slot-tracker-card enhanced-slot-card" key={`${pool}-${level}`}>
            <strong>Level {level}</strong>
            <label><span>Max</span><input min={0} onChange={(event) => changeMaximum(level, Number(event.target.value))} type="number" value={maximum} /></label>
            <span>Remaining {remaining}/{maximum}</span>
            <span>Expended {expended}</span>
            <div className="score-button-row">
              <button disabled={expended >= maximum} onClick={() => void onChange(changeSlotExpended(sheet, pool, level, 1))} type="button">Expend</button>
              <button disabled={expended <= 0} onClick={() => void onChange(changeSlotExpended(sheet, pool, level, -1))} type="button">Restore</button>
            </div>
            <label><span>Recovery</span><select onChange={(event) => changeRecovery(level, { recoverOn: event.target.value as ResourceRecoveryRule["recoverOn"] })} value={recovery.recoverOn}>{Object.entries(recoveryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Amount</span><input maxLength={100} onChange={(event) => changeRecovery(level, { recoverAmount: event.target.value })} placeholder="all or number" value={recovery.recoverAmount} /></label>
          </article>;
        })}
      </div>
    </section>
  );
}

export function SpellSlotTracker({ onChange, sheet }: SpellSlotTrackerProps) {
  return <div className="spell-slot-tracker-stack">
    <SlotPoolEditor onChange={onChange} pool="spellSlots" sheet={sheet} />
    <SlotPoolEditor onChange={onChange} pool="pactMagic" sheet={sheet} />
  </div>;
}
