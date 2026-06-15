import { describe, expect, it } from "vitest";
import { extractCharacterText } from "./extract";
import { mergeImportResults } from "./merge";

const result = (fileId: string, sourceName: string, rawText: string) => ({
  fileId, sourceName, rawText, confidence: null, draft: extractCharacterText(rawText, sourceName),
});

describe("multi-file character import merge", () => {
  it("combines complementary partial sources into one draft", () => {
    const merged = mergeImportResults([
      result("one", "stats.pdf", "Character Name: Mira\nStrength 18\nArmor Class: 17"),
      result("two", "gear.jpg", "Inventory\nRope\nTorch"),
      result("three", "features.png", "Features\nSecond Wind"),
    ]);
    expect(merged.mergedDraft.name.value).toBe("Mira");
    expect(merged.mergedDraft.abilityScores.str.value).toBe(18);
    expect(merged.mergedDraft.inventory.value).toContain("Rope");
    expect(merged.mergedDraft.features.value).toContain("Second Wind");
  });

  it("flags contradictory values instead of silently overwriting them", () => {
    const merged = mergeImportResults([
      result("one", "page-one.pdf", "Character Name: Mira\nArmor Class: 17"),
      result("two", "page-two.jpg", "Character Name: Mira\nArmor Class: 19"),
    ]);
    expect(merged.mergedDraft.armorClass.needsReview).toBe(true);
    expect(merged.mergedDraft.armorClass.conflicts).toHaveLength(1);
    expect(merged.conflicts.some((conflict) => conflict.fieldPath === "armorClass")).toBe(true);
  });
});
