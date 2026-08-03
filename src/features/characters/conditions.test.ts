import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../storage/database";
import { createCharacter } from "../../storage/characters";
import { createEmptyCharacterSheet, getOrCreateCharacterSheet, saveCharacterSheet } from "../../storage/characterSheets";
import { characterSheetSchema } from "../../domain/models";
import { conditionDefinitions, conditionSummary } from "./conditions";

describe("character conditions", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("provides every supported standard condition with expandable rules help", () => {
    expect(conditionDefinitions.map((condition) => condition.label)).toEqual([
      "Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible",
      "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious",
    ]);
    expect(conditionDefinitions.every((condition) => condition.summary.length > 20)).toBe(true);
  });

  it("builds a compact active summary including exhaustion", () => {
    expect(conditionSummary([], 0)).toBe("Clear");
    expect(conditionSummary(["poisoned"], 0)).toBe("Poisoned");
    expect(conditionSummary(["poisoned"], 2)).toBe("Poisoned · Exhaustion 2");
    expect(conditionSummary(["poisoned", "restrained"], 2)).toBe("3 active");
  });

  it("persists conditions, exhaustion, and inspiration independently per character", async () => {
    const cloud = await createCharacter({ name: "Cloud", characterClass: "Fighter", ancestry: "Human" });
    const akiva = await createCharacter({ name: "Akiva", characterClass: "Druid", ancestry: "Elf" });
    await saveCharacterSheet({ ...createEmptyCharacterSheet(cloud.id), activeConditions: ["poisoned"], exhaustionLevel: 1, heroicInspiration: false });
    await saveCharacterSheet({ ...createEmptyCharacterSheet(akiva.id), activeConditions: ["restrained"], exhaustionLevel: 0, heroicInspiration: true });

    expect(await getOrCreateCharacterSheet(cloud.id)).toMatchObject({ activeConditions: ["poisoned"], exhaustionLevel: 1, heroicInspiration: false });
    expect(await getOrCreateCharacterSheet(akiva.id)).toMatchObject({ activeConditions: ["restrained"], exhaustionLevel: 0, heroicInspiration: true });
  });

  it("migrates an older parsed sheet to safe defaults", () => {
    const current = createEmptyCharacterSheet(crypto.randomUUID());
    const legacy = { ...current } as Record<string, unknown>;
    delete legacy.activeConditions;
    delete legacy.exhaustionLevel;
    delete legacy.heroicInspiration;
    delete legacy.customSenses;

    const parsed = characterSheetSchema.parse(legacy);
    expect(parsed).toMatchObject({ activeConditions: [], exhaustionLevel: 0, heroicInspiration: true, customSenses: "" });
  });
});
