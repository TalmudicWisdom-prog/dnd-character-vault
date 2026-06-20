import type { CharacterSheet } from "../domain/models";
import { characterSheetSchema } from "../domain/models";
import { proficiencyBonusForLevel } from "../domain/dndMath";
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
    proficiencyBonus: 2,
    currentHp: 0,
    maxHp: 0,
    temporaryHp: 0,
    armorClass: 10,
    initiative: 0,
    speed: 30,
    hitDice: "",
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    attacks: "",
    weapons: "",
    damageNotes: "",
    savingThrows: Object.fromEntries(abilityIds.map((ability) => [ability, false])),
    skillProficiencies: Object.fromEntries(skillIds.map((skill) => [skill, false])),
    armorProficiencies: "",
    weaponProficiencies: "",
    toolProficiencies: "",
    languages: "",
    spellcastingAbility: null,
    spellSaveDc: 0,
    spellAttackBonus: 0,
    cantrips: "",
    preparedSpells: "",
    spellSlots: {},
    spellNotes: "",
    classFeatures: "",
    speciesTraits: "",
    backgroundFeature: "",
    feats: "",
    specialAbilities: "",
    notes: "",
    updatedAt: new Date().toISOString(),
  });
}

export function createCharacterSheetDraft(level = 1) {
  const { characterId: _characterId, updatedAt: _updatedAt, ...sheet } = createEmptyCharacterSheet(crypto.randomUUID());
  return { ...sheet, proficiencyBonus: proficiencyBonusForLevel(level) };
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
