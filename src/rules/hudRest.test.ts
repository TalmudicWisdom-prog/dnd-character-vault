import { describe, expect, it } from "vitest";
import { createEmptyCharacterSheet } from "../storage/characterSheets";
import { applyHudRestRecovery, buildHudRestPreview, type HudRecoveryHandler } from "./hudRest";

describe("Live HUD rest recovery", () => {
  it("previews a short rest without inventing automatic hit-die healing", () => {
    const sheet = { ...createEmptyCharacterSheet(crypto.randomUUID()), currentHp: 7, maxHp: 20, hitDice: "3d8" };
    const preview = buildHudRestPreview(sheet, "shortRest");
    expect(preview[0]).toMatchObject({ label: "Hit Points", before: "7/20", after: "7/20", changes: false });
    expect(preview[0].note).toContain("Spend and roll");
  });

  it("applies long-rest HP and configured slot recovery in one result", () => {
    const sheet = {
      ...createEmptyCharacterSheet(crypto.randomUUID()),
      currentHp: 7,
      maxHp: 20,
      spellSlots: { "1": 4 },
      spellSlotsUsed: { "1": 3 },
    };
    const recovered = applyHudRestRecovery(sheet, "longRest");
    expect(recovered.currentHp).toBe(20);
    expect(recovered.spellSlotsUsed["1"]).toBe(0);
  });

  it("leaves the original sheet untouched until confirmation applies the returned value", () => {
    const sheet = { ...createEmptyCharacterSheet(crypto.randomUUID()), currentHp: 4, maxHp: 18 };
    buildHudRestPreview(sheet, "longRest");
    expect(sheet.currentHp).toBe(4);
  });

  it("supports explicit future module recovery hooks without guessing homebrew rules", () => {
    const handler: HudRecoveryHandler = {
      id: "test-resource",
      preview: (_sheet, rest) => [{ id: "test-resource", label: "Test Resource", before: "0/1", after: rest === "shortRest" ? "1/1" : "0/1", changes: rest === "shortRest" }],
      apply: (sheet, rest) => rest === "shortRest" ? { ...sheet, notes: `${sheet.notes}Recovered by registered rule.` } : sheet,
    };
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    expect(buildHudRestPreview(sheet, "shortRest", [handler]).at(-1)?.changes).toBe(true);
    expect(applyHudRestRecovery(sheet, "shortRest", [handler]).notes).toContain("registered rule");
    expect(applyHudRestRecovery(sheet, "longRest", [handler]).notes).toBe("");
  });
});
