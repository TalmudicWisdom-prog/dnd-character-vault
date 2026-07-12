import { describe, expect, it, vi } from "vitest";
import { createEmptyCharacterSheet } from "../storage/characterSheets";
import {
  applyRestRecovery,
  buildRestPreview,
  changeSlotExpended,
  changeUsedSpellSlots,
  remainingSpellSlots,
  resetUsedSpellSlots,
  shouldConfirmLongRest,
} from "./spellSlots";

describe("spell slot tracking", () => {
  it("tracks used and remaining slots manually", () => {
    expect(changeUsedSpellSlots(3, 0, 1)).toBe(1);
    expect(changeUsedSpellSlots(3, 3, 1)).toBe(3);
    expect(changeUsedSpellSlots(3, 0, -1)).toBe(0);
    expect(remainingSpellSlots(3, 2)).toBe(1);
  });

  it("resets used slots on long rest", () => {
    expect(resetUsedSpellSlots({ "1": 2, "2": 1 })).toEqual({ "1": 0, "2": 0 });
  });

  it("asks for confirmation before resetting used spell slots", () => {
    const confirm = vi.fn(() => false);
    expect(shouldConfirmLongRest(true, confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(shouldConfirmLongRest(false, confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("restores normal spell slots on Long Rest", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    sheet.spellSlots = { "1": 4, "2": 2 };
    sheet.spellSlotsUsed = { "1": 3, "2": 1 };

    const rested = applyRestRecovery(sheet, "longRest");

    expect(rested.spellSlotsUsed).toMatchObject({ "1": 0, "2": 0 });
  });

  it("does not restore normal spell slots on Short Rest unless configured", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    sheet.spellSlots = { "1": 2, "2": 1 };
    sheet.spellSlotsUsed = { "1": 2, "2": 1 };
    sheet.spellSlotRecovery = { "2": { recoverOn: "shortRest", recoverAmount: "all" } };

    const rested = applyRestRecovery(sheet, "shortRest");

    expect(rested.spellSlotsUsed).toMatchObject({ "1": 2, "2": 0 });
  });

  it("recovers separate short-rest Pact Magic pools correctly", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    sheet.spellSlots = { "1": 2 };
    sheet.spellSlotsUsed = { "1": 1 };
    sheet.pactMagicSlots = { "2": 2 };
    sheet.pactMagicSlotsUsed = { "2": 2 };

    const preview = buildRestPreview(sheet, "shortRest");
    const rested = applyRestRecovery(sheet, "shortRest");

    expect(preview.find((resource) => resource.pool === "pactMagic" && resource.level === "2")?.recovers).toBe(true);
    expect(rested.spellSlotsUsed["1"]).toBe(1);
    expect(rested.pactMagicSlotsUsed["2"]).toBe(0);
  });

  it("manual recovery cannot exceed maximum or go below zero", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    sheet.spellSlots = { "1": 1 };
    sheet.spellSlotsUsed = { "1": 1 };

    expect(changeSlotExpended(sheet, "spellSlots", "1", 1).spellSlotsUsed["1"]).toBe(1);
    expect(changeSlotExpended(sheet, "spellSlots", "1", -5).spellSlotsUsed["1"]).toBe(0);
  });

  it("HP values cannot affect spell-slot values", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    sheet.currentHp = 125;
    sheet.maxHp = 125;
    sheet.spellSlots = { "1": 2 };
    sheet.spellSlotsUsed = { "1": 1 };

    expect(remainingSpellSlots(sheet.spellSlots["1"], sheet.spellSlotsUsed["1"])).toBe(1);
    expect(applyRestRecovery(sheet, "longRest").spellSlotsUsed["1"]).toBe(0);
  });
});
