import { proficiencyBonusForLevel } from "../domain/dndMath";

export const levelUpControlledFields = [
  "Max HP",
  "Hit dice",
  "Class features",
  "Spell slots",
  "Ability score improvements / feats",
];

export function levelUpPreview(level: number) {
  const currentLevel = Math.max(1, Math.min(20, Math.round(level)));
  const nextLevel = currentLevel < 20 ? currentLevel + 1 : null;
  const currentProficiencyBonus = proficiencyBonusForLevel(currentLevel);
  const nextProficiencyBonus = nextLevel ? proficiencyBonusForLevel(nextLevel) : currentProficiencyBonus;
  return {
    currentLevel,
    nextLevel,
    currentProficiencyBonus,
    nextProficiencyBonus,
    proficiencyChanges: nextLevel != null && nextProficiencyBonus !== currentProficiencyBonus,
    fields: levelUpControlledFields,
  };
}
