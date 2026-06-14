import { z } from "zod";

export const characterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  summary: z.string().max(20000),
  playerName: z.string().max(100),
  campaign: z.string().max(100),
  ancestry: z.string().max(100),
  characterClass: z.string().max(100),
  level: z.number().int().min(1).max(20),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Character = z.infer<typeof characterSchema>;

export const characterDraftSchema = characterSchema.pick({
  name: true,
  summary: true,
  playerName: true,
  campaign: true,
  ancestry: true,
  characterClass: true,
  level: true,
});

export type CharacterDraft = z.infer<typeof characterDraftSchema>;

export const abilityIdSchema = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
export type AbilityId = z.infer<typeof abilityIdSchema>;

export const skillIdSchema = z.enum([
  "acrobatics",
  "animalHandling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleightOfHand",
  "stealth",
  "survival",
]);
export type SkillId = z.infer<typeof skillIdSchema>;

const abilityScoresSchema = z.record(abilityIdSchema, z.number().int().min(1).max(30));
const savingThrowsSchema = z.record(abilityIdSchema, z.boolean());
const skillProficienciesSchema = z.record(skillIdSchema, z.boolean());

export const characterSheetSchema = z.object({
  characterId: z.string().uuid(),
  abilityScores: abilityScoresSchema,
  currentHp: z.number().int().min(0),
  maxHp: z.number().int().min(0),
  temporaryHp: z.number().int().min(0),
  armorClass: z.number().int().min(0),
  initiative: z.number().int(),
  speed: z.number().int().min(0),
  savingThrows: savingThrowsSchema,
  skillProficiencies: skillProficienciesSchema,
  notes: z.string().max(50000),
  updatedAt: z.string().datetime(),
});
export type CharacterSheet = z.infer<typeof characterSheetSchema>;

export const inventoryContainerSchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type InventoryContainer = z.infer<typeof inventoryContainerSchema>;

export const inventoryItemSchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  containerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  quantity: z.number().int().min(0),
  category: z.string().max(100),
  description: z.string().max(20000),
  equipped: z.boolean(),
  favorite: z.boolean(),
  customRulesText: z.string().max(30000),
  effectsAndStats: z.string().max(30000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const spellActionTypeSchema = z.enum(["action", "bonusAction", "reaction", "minute", "hour", "special"]);
export type SpellActionType = z.infer<typeof spellActionTypeSchema>;

export const spellbookSchema = z.object({
  characterId: z.string().uuid(),
  pinnedSpellIds: z.array(z.string().uuid()),
  updatedAt: z.string().datetime(),
});
export type Spellbook = z.infer<typeof spellbookSchema>;

export const spellSchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  name: z.string().min(1).max(200),
  level: z.number().int().min(0).max(9),
  school: z.string().min(1).max(100),
  castingTime: z.string().min(1).max(200),
  actionType: spellActionTypeSchema,
  range: z.string().min(1).max(200),
  verbalComponent: z.boolean(),
  somaticComponent: z.boolean(),
  materialComponent: z.boolean(),
  materialDetails: z.string().max(1000),
  duration: z.string().min(1).max(200),
  concentration: z.boolean(),
  ritual: z.boolean(),
  damageType: z.string().max(100),
  damageFormula: z.string().max(200),
  healingFormula: z.string().max(200),
  areaOfEffectType: z.string().max(100),
  areaOfEffectSize: z.string().max(100),
  savingThrowType: z.string().max(100),
  attackRollRequired: z.boolean(),
  statusEffects: z.string().max(2000),
  description: z.string().max(50000),
  higherLevelScaling: z.string().max(20000),
  sourceNotes: z.string().max(10000),
  homebrew: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Spell = z.infer<typeof spellSchema>;

export const soulReaperPathSchema = z.enum([
  "unselected",
  "graveWarden",
  "soulBinder",
  "dreadReaper",
  "paleRider",
  "plagueReaper",
]);
export type SoulReaperPath = z.infer<typeof soulReaperPathSchema>;

export const soulReaperProgressionSchema = z.object({
  characterId: z.string().uuid(),
  level: z.number().int().min(1).max(20),
  path: soulReaperPathSchema,
  currentSouls: z.number().int().min(0),
  sourcePdfId: z.string().uuid().nullable(),
  notes: z.string().max(30000),
  updatedAt: z.string().datetime(),
});
export type SoulReaperProgression = z.infer<typeof soulReaperProgressionSchema>;

export const pdfDocumentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(300),
  fileName: z.string().min(1).max(300),
  size: z.number().int().nonnegative(),
  gameSystem: z.string().max(100),
  characterIds: z.array(z.string().uuid()),
  lastPage: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PdfDocument = z.infer<typeof pdfDocumentSchema>;

export const pdfFileSchema = z.object({
  documentId: z.string().uuid(),
  data: z.instanceof(Blob),
});
export type PdfFile = z.infer<typeof pdfFileSchema>;

export const pdfBookmarkSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  page: z.number().int().min(1),
  label: z.string().min(1).max(150),
  createdAt: z.string().datetime(),
});
export type PdfBookmark = z.infer<typeof pdfBookmarkSchema>;

export const themeSchema = z.enum(["system", "light", "dark"]);
export type ThemePreference = z.infer<typeof themeSchema>;

export const settingsSchema = z.object({
  id: z.literal("app"),
  theme: themeSchema,
  backupReminders: z.boolean(),
  updatedAt: z.string().datetime(),
});

export type AppSettings = z.infer<typeof settingsSchema>;
