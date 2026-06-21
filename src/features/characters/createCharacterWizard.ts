export const creationSteps = [
  "Essentials",
  "Class",
  "Species / Ancestry",
  "Background / Origin",
  "Character Concept",
  "Ability Score Setup",
  "Ability Scores",
  "Skills and Saves",
  "Combat",
  "Equipment",
  "Spells",
  "Features and Traits",
  "Review and Create",
] as const;

export type CreationStepIndex = number;

export function clampCreationStep(step: number): CreationStepIndex {
  return Math.max(0, Math.min(creationSteps.length - 1, step));
}

export function nextCreationStep(step: number): CreationStepIndex {
  return clampCreationStep(step + 1);
}

export function previousCreationStep(step: number): CreationStepIndex {
  return clampCreationStep(step - 1);
}
