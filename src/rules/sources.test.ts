import { describe, expect, it } from "vitest";
import { inventoryItemSchema, spellSchema } from "../domain/models";
import { rulesSourceLabel } from "./sources";
import { contentSource, defaultEnabledContentSourceIds, FFXIV_CONTENT_SOURCE_ID } from "./contentSources";

const timestamp = new Date().toISOString();

describe("rules source labels", () => {
  it("labels every supported source", () => {
    expect(rulesSourceLabel("SRD")).toBe("SRD");
    expect(rulesSourceLabel("Manual")).toBe("Manual");
    expect(rulesSourceLabel("Imported PDF")).toBe("Imported PDF");
    expect(rulesSourceLabel("Homebrew")).toBe("Homebrew");
  });

  it("defaults old inventory and spell records safely", () => {
    const item = inventoryItemSchema.parse({
      id: crypto.randomUUID(),
      characterId: crypto.randomUUID(),
      containerId: crypto.randomUUID(),
      name: "Old item",
      quantity: 1,
      category: "",
      description: "",
      equipped: false,
      favorite: false,
      customRulesText: "",
      effectsAndStats: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const spell = spellSchema.parse({
      id: crypto.randomUUID(),
      characterId: crypto.randomUUID(),
      name: "Old spell",
      level: 0,
      school: "Custom",
      castingTime: "1 action",
      actionType: "action",
      range: "Self",
      verbalComponent: false,
      somaticComponent: false,
      materialComponent: false,
      materialDetails: "",
      duration: "Instantaneous",
      concentration: false,
      ritual: false,
      damageType: "",
      damageFormula: "",
      healingFormula: "",
      areaOfEffectType: "",
      areaOfEffectSize: "",
      savingThrowType: "",
      attackRollRequired: false,
      statusEffects: "",
      description: "",
      higherLevelScaling: "",
      sourceNotes: "",
      homebrew: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(item.source).toBe("Manual");
    expect(spell.source).toBe("Manual");
    expect(spell.rulesSourceId).toBe("");
    expect(spell.contentSourceId).toBe("");
    expect(spell.rulesComplete).toBe(true);
  });

  it("registers the optional FFXIV source independently from the SRD", () => {
    expect(contentSource(FFXIV_CONTENT_SOURCE_ID)).toMatchObject({ displayName: "Final Fantasy Companion Guide", shortLabel: "FFXIV", sourceType: "Homebrew", optional: true });
    expect(defaultEnabledContentSourceIds).toContain(FFXIV_CONTENT_SOURCE_ID);
  });
});
