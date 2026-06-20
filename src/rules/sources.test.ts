import { describe, expect, it } from "vitest";
import { inventoryItemSchema, spellSchema } from "../domain/models";
import { rulesSourceLabel } from "./sources";

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
  });
});
