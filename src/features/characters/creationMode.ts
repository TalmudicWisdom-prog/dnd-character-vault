import type { AbilityId, CharacterCreationDraft, CreationMode, SkillId } from "../../domain/models";
import { abilityModifier, proficiencyBonusForLevel } from "../../domain/dndMath";
import type { SrdClass } from "../../rules/srd";

export function modeLabel(mode: CreationMode) {
  return mode === "guided" ? "Guided" : "Manual";
}

export function selectedSkillCount(skillProficiencies: Partial<Record<SkillId, boolean>>) {
  return Object.values(skillProficiencies).filter(Boolean).length;
}

export function canChooseSkill(current: Partial<Record<SkillId, boolean>>, skill: SkillId, limit: number, guided: boolean) {
  if (!guided || current[skill]) return true;
  return selectedSkillCount(current) < limit;
}

export function suggestedMaxHp(level: number, hitDie: number, constitutionScore: number) {
  const conModifier = abilityModifier(constitutionScore);
  const firstLevelHp = Math.max(1, hitDie + conModifier);
  if (level <= 1) return firstLevelHp;
  const averagePerLevel = Math.floor(hitDie / 2) + 1 + conModifier;
  return Math.max(1, firstLevelHp + Math.max(0, level - 1) * Math.max(1, averagePerLevel));
}

export function guidedReviewWarnings(draft: CharacterCreationDraft, selectedClass?: SrdClass) {
  const warnings: string[] = [];
  if (!draft.character.name.trim()) warnings.push("Character name is missing.");
  if (!draft.character.characterClass.trim()) warnings.push("Class is missing.");
  if (!draft.character.ancestry.trim()) warnings.push("Species / ancestry is missing.");
  if (draft.sheet.proficiencyBonus !== proficiencyBonusForLevel(draft.character.level)) warnings.push("Proficiency bonus does not match the character level.");
  if (Object.values(draft.sheet.abilityScores).every((score) => score === 10)) warnings.push("Ability scores still look like default placeholders.");
  if (draft.abilityScoreSetup.mode === "guided" && draft.abilityScoreSetup.guidedMethod === "standardArray") {
    const assigned = Object.values(draft.abilityScoreSetup.standardArrayAssignments).filter((value) => value != null).length;
    if (assigned < 6) warnings.push("Standard Array has unassigned scores.");
  }
  if (draft.abilityScoreSetup.mode === "guided" && draft.abilityScoreSetup.guidedMethod === "rollDice") {
    const assigned = Object.values(draft.abilityScoreSetup.rolledAssignments).filter((value) => value != null).length;
    if (assigned < 6) warnings.push("Rolled ability scores have unassigned results.");
  }
  if (selectedClass) {
    const count = selectedSkillCount(draft.sheet.skillProficiencies);
    if (count > selectedClass.skillChoiceCount) warnings.push(`Too many class skills selected: ${count} of ${selectedClass.skillChoiceCount}.`);
  }
  return warnings;
}

export function classSavingThrowRecord(savingThrows: Partial<Record<AbilityId, boolean>>, selectedClass?: SrdClass) {
  if (!selectedClass) return savingThrows;
  return { ...savingThrows, ...Object.fromEntries(selectedClass.savingThrows.map((ability) => [ability, true])) };
}
