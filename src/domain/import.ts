import type { AbilityId, SkillId } from "./models";

export type ImportField<T> = {
  value: T;
  include: boolean;
  needsReview: boolean;
};

export type CharacterImportDraft = {
  sourceName: string;
  rawText: string;
  name: ImportField<string>;
  playerName: ImportField<string>;
  level: ImportField<number>;
  characterClass: ImportField<string>;
  ancestry: ImportField<string>;
  background: ImportField<string>;
  abilityScores: Record<AbilityId, ImportField<number>>;
  currentHp: ImportField<number>;
  maxHp: ImportField<number>;
  armorClass: ImportField<number>;
  initiative: ImportField<number>;
  speed: ImportField<number>;
  skills: Record<SkillId, ImportField<boolean>>;
  savingThrows: Record<AbilityId, ImportField<boolean>>;
  inventory: ImportField<string[]>;
  features: ImportField<string[]>;
  spellsAndNotes: ImportField<string>;
};

export type ImportSaveMode = "create" | "merge";
