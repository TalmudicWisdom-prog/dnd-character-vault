import type { CharacterSheet } from "../domain/models";
import { characterSheetSchema } from "../domain/models";
import { db } from "./database";

export const abilityIds = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const skillIds = [
  "acrobatics", "animalHandling", "arcana", "athletics", "deception", "history",
  "insight", "intimidation", "investigation", "medicine", "nature", "perception",
  "performance", "persuasion", "religion", "sleightOfHand", "stealth", "survival",
] as const;

export function createEmptyCharacterSheet(characterId: string): CharacterSheet {
  return characterSheetSchema.parse({
    characterId,
    abilityScores: Object.fromEntries(abilityIds.map((ability) => [ability, 10])),
    currentHp: 0,
    maxHp: 0,
    temporaryHp: 0,
    armorClass: 10,
    initiative: 0,
    speed: 30,
    savingThrows: Object.fromEntries(abilityIds.map((ability) => [ability, false])),
    skillProficiencies: Object.fromEntries(skillIds.map((skill) => [skill, false])),
    notes: "",
    updatedAt: new Date().toISOString(),
  });
}

export async function getOrCreateCharacterSheet(characterId: string) {
  const stored = await db.characterSheets.get(characterId);
  const parsed = characterSheetSchema.safeParse(stored);
  if (parsed.success) return parsed.data;

  const sheet = createEmptyCharacterSheet(characterId);
  await db.characterSheets.put(sheet);
  return sheet;
}

export async function saveCharacterSheet(sheet: CharacterSheet) {
  const validated = characterSheetSchema.parse({
    ...sheet,
    updatedAt: new Date().toISOString(),
  });
  await db.characterSheets.put(validated);
  await db.characters.update(sheet.characterId, { updatedAt: validated.updatedAt });
  return validated;
}
