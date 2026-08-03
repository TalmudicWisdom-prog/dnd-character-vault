import type { CharacterSheet } from "../domain/models";
import { applyRestRecovery, buildRestPreview, type RestKind } from "./spellSlots";

export type HudRecoveryEffect = {
  id: string;
  label: string;
  before: string;
  after: string;
  changes: boolean;
  note?: string;
};

export type HudRecoveryHandler = {
  id: string;
  preview: (sheet: CharacterSheet, rest: RestKind) => readonly HudRecoveryEffect[];
  apply: (sheet: CharacterSheet, rest: RestKind) => CharacterSheet;
};

export function buildHudRestPreview(sheet: CharacterSheet, rest: RestKind, handlers: readonly HudRecoveryHandler[] = []) {
  const hpAfter = rest === "longRest" ? sheet.maxHp : sheet.currentHp;
  const hpEffect: HudRecoveryEffect = {
    id: "hit-points",
    label: "Hit Points",
    before: `${sheet.currentHp}/${sheet.maxHp}`,
    after: `${hpAfter}/${sheet.maxHp}`,
    changes: hpAfter !== sheet.currentHp,
    note: rest === "shortRest"
      ? sheet.hitDice.trim() ? `Hit dice available: ${sheet.hitDice}. Spend and roll them from Health details.` : "Hit dice are unset; no automatic healing will be applied."
      : "A Long Rest restores current Hit Points to the stored maximum.",
  };
  const slotEffects: HudRecoveryEffect[] = buildRestPreview(sheet, rest).map((resource) => ({
    id: `${resource.pool}-${resource.level}`,
    label: resource.label,
    before: `${resource.remainingBefore}/${resource.maximum}`,
    after: `${resource.remainingAfter}/${resource.maximum}`,
    changes: resource.recovers,
    note: resource.recovers ? undefined : `Recovery rule: ${resource.recovery.recoverOn}`,
  }));
  return [hpEffect, ...slotEffects, ...handlers.flatMap((handler) => handler.preview(sheet, rest))];
}

export function applyHudRestRecovery(sheet: CharacterSheet, rest: RestKind, handlers: readonly HudRecoveryHandler[] = []) {
  const coreRecovered = applyRestRecovery({
    ...sheet,
    currentHp: rest === "longRest" ? sheet.maxHp : sheet.currentHp,
  }, rest);
  return handlers.reduce((current, handler) => handler.apply(current, rest), coreRecovered);
}
