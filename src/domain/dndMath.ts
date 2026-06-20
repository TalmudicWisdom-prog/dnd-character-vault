import type { AbilityId, CharacterSheet, SkillId } from "./models";

export const skillAbilities: Record<SkillId, AbilityId> = {
  acrobatics: "dex",
  animalHandling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleightOfHand: "dex",
  stealth: "dex",
  survival: "wis",
};

export function abilityModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function proficiencyBonusForLevel(level: number) {
  return Math.max(2, Math.min(6, Math.ceil(Math.max(1, Math.min(20, level)) / 4) + 1));
}

export function skillModifier(sheet: Pick<CharacterSheet, "abilityScores" | "proficiencyBonus" | "skillProficiencies">, skill: SkillId) {
  return abilityModifier(sheet.abilityScores[skillAbilities[skill]] ?? 10) + (sheet.skillProficiencies[skill] ? sheet.proficiencyBonus : 0);
}
