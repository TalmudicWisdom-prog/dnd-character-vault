import { describe, expect, it } from "vitest";
import { clampCreationStep, creationSteps, nextCreationStep, previousCreationStep } from "./createCharacterWizard";

describe("create character wizard navigation", () => {
  it("uses the full guided creation flow", () => {
    expect(creationSteps).toEqual([
      "Essentials",
      "Class",
      "Species / Ancestry",
      "Background / Origin",
      "Character Concept",
      "Ability Scores",
      "Skills and Saves",
      "Combat",
      "Equipment",
      "Spells",
      "Features and Traits",
      "Review and Create",
    ]);
  });

  it("moves forward and back without leaving the wizard bounds", () => {
    expect(nextCreationStep(0)).toBe(1);
    expect(previousCreationStep(1)).toBe(0);
    expect(previousCreationStep(0)).toBe(0);
    expect(nextCreationStep(11)).toBe(11);
    expect(clampCreationStep(99)).toBe(11);
  });
});
