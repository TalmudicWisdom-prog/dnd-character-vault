import type { CharacterSheet, ResourceRecoveryRule } from "../domain/models";

export type RestKind = "shortRest" | "longRest";
export type SlotPoolId = "spellSlots" | "pactMagic";
export type SlotPoolRecovery = ResourceRecoveryRule["recoverOn"];

export type SlotResourcePreview = {
  pool: SlotPoolId;
  level: string;
  label: string;
  maximum: number;
  expendedBefore: number;
  expendedAfter: number;
  remainingBefore: number;
  remainingAfter: number;
  recovers: boolean;
  recovery: ResourceRecoveryRule;
};

export const restLabels: Record<RestKind, string> = {
  shortRest: "Short Rest",
  longRest: "Long Rest",
};

export function remainingSpellSlots(maximum: number, used: number) {
  return Math.max(0, Math.max(0, maximum) - clampExpended(maximum, used));
}

export function changeUsedSpellSlots(maximum: number, used: number, change: number) {
  return Math.max(0, Math.min(Math.max(0, maximum), used + change));
}

export function resetUsedSpellSlots<T extends Record<string, number>>(used: T) {
  return Object.fromEntries(Object.keys(used).map((level) => [level, 0])) as T;
}

export function shouldConfirmLongRest(hasUsedSlots: boolean, confirm: (message: string) => boolean) {
  return confirm(hasUsedSlots ? "Take a Long Rest and reset used spell slots?" : "Take a Long Rest? No used spell slots need resetting right now.");
}

export function clampExpended(maximum: number, expended: number) {
  return Math.max(0, Math.min(Math.max(0, maximum), Math.round(Number.isFinite(expended) ? expended : 0)));
}

export function normalizeRecoveryRule(rule: Partial<ResourceRecoveryRule> | undefined, fallbackRecoverOn: SlotPoolRecovery): ResourceRecoveryRule {
  return {
    recoverOn: rule?.recoverOn ?? fallbackRecoverOn,
    recoverAmount: rule?.recoverAmount?.trim() || "all",
  };
}

export function defaultRecoveryForPool(pool: SlotPoolId): ResourceRecoveryRule {
  return { recoverOn: pool === "pactMagic" ? "shortRest" : "longRest", recoverAmount: "all" };
}

function recoveryMatchesRest(recoverOn: SlotPoolRecovery, rest: RestKind) {
  return recoverOn === "both" || recoverOn === rest;
}

function recoveryAmount(expended: number, rule: ResourceRecoveryRule) {
  if (rule.recoverAmount.toLocaleLowerCase() === "all") return expended;
  const fixed = Number(rule.recoverAmount);
  return Number.isFinite(fixed) ? Math.max(0, Math.round(fixed)) : 0;
}

export function recoverExpendedSlots(maximum: number, expended: number, rule: ResourceRecoveryRule, rest: RestKind) {
  const clamped = clampExpended(maximum, expended);
  if (rule.recoverOn === "manual" || !recoveryMatchesRest(rule.recoverOn, rest)) return clamped;
  return Math.max(0, clamped - recoveryAmount(clamped, rule));
}

function keysForPool(maximums: Record<string, number>, used: Record<string, number>, recovery: Record<string, ResourceRecoveryRule>) {
  return [...new Set([...Object.keys(maximums), ...Object.keys(used), ...Object.keys(recovery)])]
    .filter((level) => Number(level) >= 1 && Number(level) <= 9)
    .sort((a, b) => Number(a) - Number(b));
}

function poolRecords(sheet: CharacterSheet, pool: SlotPoolId) {
  return pool === "pactMagic"
    ? { maximums: sheet.pactMagicSlots, used: sheet.pactMagicSlotsUsed, recovery: sheet.pactMagicRecovery, label: "Pact Magic", fallback: defaultRecoveryForPool("pactMagic").recoverOn }
    : { maximums: sheet.spellSlots, used: sheet.spellSlotsUsed, recovery: sheet.spellSlotRecovery, label: "Spell Slots", fallback: defaultRecoveryForPool("spellSlots").recoverOn };
}

export function slotResourcePreview(sheet: CharacterSheet, pool: SlotPoolId, level: string, rest: RestKind): SlotResourcePreview {
  const records = poolRecords(sheet, pool);
  const maximum = Math.max(0, records.maximums[level] ?? 0);
  const expendedBefore = clampExpended(maximum, records.used[level] ?? 0);
  const recovery = normalizeRecoveryRule(records.recovery[level], records.fallback);
  const expendedAfter = recoverExpendedSlots(maximum, expendedBefore, recovery, rest);
  return {
    pool,
    level,
    label: `${records.label} Level ${level}`,
    maximum,
    expendedBefore,
    expendedAfter,
    remainingBefore: remainingSpellSlots(maximum, expendedBefore),
    remainingAfter: remainingSpellSlots(maximum, expendedAfter),
    recovers: expendedAfter < expendedBefore,
    recovery,
  };
}

export function buildRestPreview(sheet: CharacterSheet, rest: RestKind) {
  return (["spellSlots", "pactMagic"] satisfies SlotPoolId[]).flatMap((pool) => {
    const records = poolRecords(sheet, pool);
    return keysForPool(records.maximums, records.used, records.recovery)
      .map((level) => slotResourcePreview(sheet, pool, level, rest))
      .filter((preview) => preview.maximum > 0 || preview.expendedBefore > 0);
  });
}

function recoverPool(sheet: CharacterSheet, pool: SlotPoolId, rest: RestKind) {
  const records = poolRecords(sheet, pool);
  return Object.fromEntries(keysForPool(records.maximums, records.used, records.recovery).map((level) => {
    const preview = slotResourcePreview(sheet, pool, level, rest);
    return [level, preview.expendedAfter];
  }));
}

export function applyRestRecovery(sheet: CharacterSheet, rest: RestKind): CharacterSheet {
  return {
    ...sheet,
    spellSlotsUsed: recoverPool(sheet, "spellSlots", rest),
    pactMagicSlotsUsed: recoverPool(sheet, "pactMagic", rest),
  };
}

export function changeSlotExpended(sheet: CharacterSheet, pool: SlotPoolId, level: string, change: number): CharacterSheet {
  const records = poolRecords(sheet, pool);
  const maximum = records.maximums[level] ?? 0;
  const nextUsed = {
    ...records.used,
    [level]: changeUsedSpellSlots(maximum, records.used[level] ?? 0, change),
  };
  return pool === "pactMagic" ? { ...sheet, pactMagicSlotsUsed: nextUsed } : { ...sheet, spellSlotsUsed: nextUsed };
}
