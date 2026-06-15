import type { AbilityId, SkillId } from "./models";

export type ImportField<T> = {
  value: T;
  include: boolean;
  needsReview: boolean;
  confidence: number | null;
  sourceNames: string[];
  conflicts: Array<{ sourceName: string; value: T }>;
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

export type ImportMode = "local" | "online";
export type ImportSessionStatus = "selecting" | "parsing" | "review";

export type ImportParseResult = {
  fileId: string;
  sourceName: string;
  rawText: string;
  confidence: number | null;
  draft: CharacterImportDraft;
};

export type ImportConflict = {
  fieldPath: string;
  label: string;
  sources: Array<{ sourceName: string; value: string }>;
};

export type ImportSession = {
  id: string;
  mode: ImportMode;
  status: ImportSessionStatus;
  fileOrder: string[];
  parseResults: ImportParseResult[];
  mergedDraft: CharacterImportDraft | null;
  conflicts: ImportConflict[];
  createdAt: string;
  updatedAt: string;
};

export type ImportSessionFile = {
  id: string;
  sessionId: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  pageCount: number | null;
  data: Blob;
};
