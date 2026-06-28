import Dexie, { type EntityTable, type Transaction } from "dexie";
import type {
  AppSettings,
  Character,
  CharacterCreationDraft,
  CharacterSheet,
  InventoryContainer,
  InventoryItem,
  PdfBookmark,
  PdfDocument,
  PdfFile,
  SoulReaperProgression,
  Spell,
  Spellbook,
} from "../domain/models";
import type { ImportSession, ImportSessionFile } from "../domain/import";
import { settingsSchema } from "../domain/models";

const defaultSettings: AppSettings = {
  id: "app",
  theme: "system",
  backupReminders: true,
  lastUpdateCheck: null,
  updatedAt: new Date().toISOString(),
};

const akivaCharacterId = "e23db62b-6d14-4da0-86c1-1a496d3df438";
const cloudCharacterId = "27b6b17d-d63c-4857-9a94-abcadda74270";

type AkivaPhotoItem = {
  name: string;
  quantity?: number;
  category: string;
  description?: string;
  customRulesText?: string;
  effectsAndStats?: string;
  favorite?: boolean;
};

const akivaPhotoInventory: AkivaPhotoItem[] = [
  { name: "Cloak of Protection", category: "Wondrous item", favorite: true },
  { name: "FIDE (name uncertain)", category: "Item", description: "Transcribed from the photographed inventory. The handwritten item name may need correction." },
  { name: "Scimitar", category: "Weapon" },
  { name: "Necklace", category: "Wondrous item" },
  { name: "Heart-shaped crystal", category: "Crystal" },
  { name: "Solar Rejuvenation's Book", category: "Book", description: "Transcribed from the photographed inventory; exact title may need correction." },
  { name: "Unknown rope with book", category: "Item", description: "Transcribed from the photographed inventory; wording is uncertain." },
  {
    name: "Umbra",
    category: "Weapon / arcane focus",
    description: "A shaft crowned with a swirling crystal that seems to drift in the air.",
    customRulesText: "While attuned, you have resistance to necrotic damage. Once per long rest, you may cast Hunger of Hadar; the remaining handwritten wording is unclear.",
    effectsAndStats: "+2 arcane focus. Spells you cast deal an extra 1d6 damage.",
    favorite: true,
  },
  { name: "Blue Flower", category: "Item", description: "Name transcribed from a partially visible handwritten list; confirm wording." },
  { name: "Rod of Radiance", category: "Rod", description: "Name transcribed from a partially visible handwritten list; confirm wording." },
  { name: "Sun Blade Sword", category: "Weapon", description: "Name transcribed from a partially visible handwritten list; confirm wording." },
  { name: "Black crystals", quantity: 3, category: "Crystal" },
  { name: "Broken greatsword", category: "Weapon", description: "Name transcribed from a partially visible handwritten list; confirm wording." },
];

const akivaPhotoAbilities: AkivaPhotoItem[] = [
  {
    name: "Elemental Body Augmentation",
    category: "Body enhancement",
    description: "Cloud's photographed body augmentation, transferred to Akiva at the user's request. It combines Earth, Water, Fire, and Air upgrades.",
    customRulesText: "Not upgradable. All wording is editable so DM rulings and corrected transcription can be recorded.",
    effectsAndStats: "Earth: +1 AC and tremorsense +30 ft.\nWater: can absorb cold to heal 1d8 HP.\nFire: fire effects leave a lingering 1d4 burn for 1 round.\nAir: movement speed increases by 20 ft and can Dash as a bonus action.",
    favorite: true,
  },
  {
    name: "Seismic Bracers",
    category: "Earth enhancement",
    description: "Brass-and-stone bracers with etched pistons that pulse with seismic power.",
    customRulesText: "Not upgradable. Grants the ability to cast Erupting Earth once per long rest while attuned. The photographed note also appears to mention moving through ground-based difficult terrain without penalty; confirm with the DM.",
    favorite: true,
  },
  {
    name: "Cryo-Hydraulic Infusion Tank",
    category: "Water enhancement",
    description: "A back-mounted reservoir connected by copper tubing to the hands, misting water vapor as it cycles.",
    customRulesText: "Not upgradable. Enhances Shape Water to manipulate boiling or freezing water. Remaining photographed wording is unclear and should be confirmed with the DM.",
    favorite: true,
  },
  {
    name: "Ember Enhancement Core",
    category: "Fire enhancement",
    customRulesText: "Not upgradable. The photographed note says the damage type changes to fire and references a once-per-long-rest use; confirm exact activation wording with the DM.",
    effectsAndStats: "Attacks deal +1d6 fire damage.",
    favorite: true,
  },
  {
    name: "Aether-Jet Pauldrons",
    category: "Air enhancement",
    customRulesText: "Not upgradable. Grants limited flight: hover 10 ft for 1 minute. While active, the note appears to allow a bonus-action use of Gust of Wind or Thunderwave; confirm the exact rule and recharge with the DM.",
    favorite: true,
  },
  {
    name: "Cloud Reference Stats",
    category: "Reference",
    description: "Photographed Cloud sheet values saved as an editable reference only. These do not overwrite Akiva's character sheet.",
    customRulesText: "Some handwriting was unclear. Review before relying on these values.",
    effectsAndStats: "Armor: 15; Initiative: +3; possible secondary defense value: 14; Speed: possibly 100; Darkvision: +60.\nAbility scores: STR 10, DEX 17, CON 12, INT 15, WIS 17, CHA 8.\nSaving throw notes: STR +1, DEX +4, CON +2, INT +7, WIS +8, CHA +0.\nPassive notes: Perception 17, Investigation 12, Insight 13.",
  },
];

async function seedAkivaPhotoLoadout(transaction: Transaction) {
  const character = await transaction.table("characters").get(akivaCharacterId);
  if (!character || character.name.trim().toLowerCase() !== "akiva") return;

  const timestamp = new Date().toISOString();
  const containerTable = transaction.table("inventoryContainers");
  const itemTable = transaction.table("inventoryItems");
  const existingAugmentation = await itemTable
    .where("characterId")
    .equals(akivaCharacterId)
    .filter((item) => item.name === "Elemental Body Augmentation")
    .first();
  if (existingAugmentation) return;

  const containers = await containerTable.where("characterId").equals(akivaCharacterId).sortBy("sortOrder");
  let mainInventory = containers.find((container) => container.name === "Main Inventory");
  if (!mainInventory) {
    mainInventory = {
      id: crypto.randomUUID(),
      characterId: akivaCharacterId,
      name: "Main Inventory",
      sortOrder: containers.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await containerTable.add(mainInventory);
    containers.push(mainInventory);
  }

  let abilities = containers.find((container) => container.name === "Abilities & Enhancements");
  if (!abilities) {
    abilities = {
      id: crypto.randomUUID(),
      characterId: akivaCharacterId,
      name: "Abilities & Enhancements",
      sortOrder: containers.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await containerTable.add(abilities);
  }

  const makeItem = (item: AkivaPhotoItem, containerId: string) => ({
    id: crypto.randomUUID(),
    characterId: akivaCharacterId,
    containerId,
    name: item.name,
    quantity: item.quantity ?? 1,
    category: item.category,
    description: item.description ?? "",
    equipped: false,
    favorite: item.favorite ?? false,
    customRulesText: item.customRulesText ?? "",
    effectsAndStats: item.effectsAndStats ?? "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await itemTable.bulkAdd([
    ...akivaPhotoInventory.map((item) => makeItem(item, mainInventory.id)),
    ...akivaPhotoAbilities.map((item) => makeItem(item, abilities.id)),
  ]);
  await transaction.table("characters").update(akivaCharacterId, { updatedAt: timestamp });
}

async function repairAkivaSoulReaperOwnership(transaction: Transaction) {
  const characterTable = transaction.table("characters");
  const akiva = await characterTable.get(akivaCharacterId);
  const cloud = await characterTable.get(cloudCharacterId);
  if (akiva?.name.trim().toLowerCase() !== "akiva" || cloud?.name.trim().toLowerCase() !== "cloud") return;

  const progressionTable = transaction.table("soulReaperProgressions");
  const akivaProgression = await progressionTable.get(akivaCharacterId);
  const cloudProgression = await progressionTable.get(cloudCharacterId);
  if (akivaProgression || !cloudProgression) return;

  const timestamp = new Date().toISOString();
  await progressionTable.put({ ...cloudProgression, characterId: akivaCharacterId, updatedAt: timestamp });
  await progressionTable.delete(cloudCharacterId);

  if (cloudProgression.sourcePdfId) {
    const documentTable = transaction.table("pdfDocuments");
    const document = await documentTable.get(cloudProgression.sourcePdfId);
    if (document) {
      document.characterIds = [...new Set([
        ...document.characterIds.filter((characterId: string) => characterId !== cloudCharacterId),
        akivaCharacterId,
      ])];
      document.updatedAt = timestamp;
      await documentTable.put(document);
    }
  }
  await characterTable.update(akivaCharacterId, { updatedAt: timestamp });
}

class CharacterVaultDatabase extends Dexie {
  characters!: EntityTable<Character, "id">;
  characterSheets!: EntityTable<CharacterSheet, "characterId">;
  inventoryContainers!: EntityTable<InventoryContainer, "id">;
  inventoryItems!: EntityTable<InventoryItem, "id">;
  spellbooks!: EntityTable<Spellbook, "characterId">;
  spells!: EntityTable<Spell, "id">;
  importSessions!: EntityTable<ImportSession, "id">;
  importSessionFiles!: EntityTable<ImportSessionFile, "id">;
  soulReaperProgressions!: EntityTable<SoulReaperProgression, "characterId">;
  pdfDocuments!: EntityTable<PdfDocument, "id">;
  pdfFiles!: EntityTable<PdfFile, "documentId">;
  pdfBookmarks!: EntityTable<PdfBookmark, "id">;
  settings!: EntityTable<AppSettings, "id">;
  characterCreationDrafts!: EntityTable<CharacterCreationDraft, "id">;

  constructor() {
    super("dnd-character-vault");

    this.version(1).stores({
      characters: "id, name, updatedAt, createdAt",
      settings: "id",
    });

    this.version(2)
      .stores({
        characters: "id, name, updatedAt, createdAt, archivedAt",
        settings: "id",
      })
      .upgrade((transaction) =>
        transaction.table("characters").toCollection().modify((character) => {
          character.playerName ??= "";
          character.campaign ??= "";
          character.ancestry ??= "";
          character.characterClass ??= "";
          character.level ??= 1;
          character.archivedAt ??= null;
        }),
      );

    this.version(3).stores({
      characters: "id, name, updatedAt, createdAt, archivedAt",
      characterSheets: "characterId, updatedAt",
      pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
      pdfFiles: "documentId",
      pdfBookmarks: "id, documentId, [documentId+page], createdAt",
      settings: "id",
    });

    this.version(4).stores({
      characters: "id, name, updatedAt, createdAt, archivedAt",
      characterSheets: "characterId, updatedAt",
      inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
      inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
      pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
      pdfFiles: "documentId",
      pdfBookmarks: "id, documentId, [documentId+page], createdAt",
      settings: "id",
    });

    this.version(5)
      .stores({
        characters: "id, name, updatedAt, createdAt, archivedAt",
        characterSheets: "characterId, updatedAt",
        inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
        inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
        pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
        pdfFiles: "documentId",
        pdfBookmarks: "id, documentId, [documentId+page], createdAt",
        settings: "id",
      })
      .upgrade(async (transaction) => {
        const containers = await transaction.table("inventoryContainers").toArray();
        const firstByName = new Map<string, string>();
        for (const container of containers) {
          const key = `${container.characterId}\u0000${container.name}`;
          const destinationId = firstByName.get(key);
          if (!destinationId) {
            firstByName.set(key, container.id);
            continue;
          }
          await transaction.table("inventoryItems").where("containerId").equals(container.id).modify({ containerId: destinationId });
          await transaction.table("inventoryContainers").delete(container.id);
        }
      });

    this.version(6).stores({
      characters: "id, name, updatedAt, createdAt, archivedAt",
      characterSheets: "characterId, updatedAt",
      inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
      inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
      soulReaperProgressions: "characterId, level, path, updatedAt",
      pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
      pdfFiles: "documentId",
      pdfBookmarks: "id, documentId, [documentId+page], createdAt",
      settings: "id",
    });

    this.version(7)
      .stores({
        characters: "id, name, updatedAt, createdAt, archivedAt",
        characterSheets: "characterId, updatedAt",
        inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
        inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
        soulReaperProgressions: "characterId, level, path, updatedAt",
        pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
        pdfFiles: "documentId",
        pdfBookmarks: "id, documentId, [documentId+page], createdAt",
        settings: "id",
      })
      .upgrade(seedAkivaPhotoLoadout);

    this.version(8)
      .stores({
        characters: "id, name, updatedAt, createdAt, archivedAt",
        characterSheets: "characterId, updatedAt",
        inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
        inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
        soulReaperProgressions: "characterId, level, path, updatedAt",
        pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
        pdfFiles: "documentId",
        pdfBookmarks: "id, documentId, [documentId+page], createdAt",
        settings: "id",
      })
      .upgrade(seedAkivaPhotoLoadout);

    this.version(9)
      .stores({
        characters: "id, name, updatedAt, createdAt, archivedAt",
        characterSheets: "characterId, updatedAt",
        inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
        inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
        soulReaperProgressions: "characterId, level, path, updatedAt",
        pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
        pdfFiles: "documentId",
        pdfBookmarks: "id, documentId, [documentId+page], createdAt",
        settings: "id",
      })
      .upgrade(repairAkivaSoulReaperOwnership);

    this.version(10).stores({
      characters: "id, name, updatedAt, createdAt, archivedAt",
      characterSheets: "characterId, updatedAt",
      inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
      inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
      spellbooks: "characterId, updatedAt",
      spells: "id, characterId, level, school, actionType, damageType, updatedAt, [characterId+level]",
      soulReaperProgressions: "characterId, level, path, updatedAt",
      pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
      pdfFiles: "documentId",
      pdfBookmarks: "id, documentId, [documentId+page], createdAt",
      settings: "id",
    });

    this.version(11).stores({
      characters: "id, name, updatedAt, createdAt, archivedAt",
      characterSheets: "characterId, updatedAt",
      inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
      inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
      spellbooks: "characterId, updatedAt",
      spells: "id, characterId, level, school, actionType, damageType, updatedAt, [characterId+level]",
      importSessions: "id, status, updatedAt, createdAt",
      importSessionFiles: "id, sessionId, [sessionId+lastModified]",
      soulReaperProgressions: "characterId, level, path, updatedAt",
      pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
      pdfFiles: "documentId",
      pdfBookmarks: "id, documentId, [documentId+page], createdAt",
      settings: "id",
    });

    this.version(12)
      .stores({
        characters: "id, name, updatedAt, createdAt, archivedAt",
        characterSheets: "characterId, updatedAt",
        inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
        inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
        spellbooks: "characterId, updatedAt",
        spells: "id, characterId, level, school, actionType, damageType, updatedAt, [characterId+level]",
        importSessions: "id, status, updatedAt, createdAt",
        importSessionFiles: "id, sessionId, [sessionId+lastModified]",
        characterCreationDrafts: "id, updatedAt",
        soulReaperProgressions: "characterId, level, path, updatedAt",
        pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
        pdfFiles: "documentId",
        pdfBookmarks: "id, documentId, [documentId+page], createdAt",
        settings: "id",
      })
      .upgrade(async (transaction) => {
        await transaction.table("characters").toCollection().modify((character) => {
          character.background ??= "";
          character.concept ??= "";
          character.personalityNotes ??= "";
          character.backstory ??= character.summary ?? "";
          character.goals ??= "";
          character.importantRelationships ??= "";
          character.roleplayNotes ??= "";
        });
        await transaction.table("characterSheets").toCollection().modify((sheet) => {
          sheet.proficiencyBonus ??= 2;
          sheet.hitDice ??= "";
          sheet.deathSaveSuccesses ??= 0;
          sheet.deathSaveFailures ??= 0;
          sheet.attacks ??= "";
          sheet.weapons ??= "";
          sheet.damageNotes ??= "";
          sheet.armorProficiencies ??= "";
          sheet.weaponProficiencies ??= "";
          sheet.toolProficiencies ??= "";
          sheet.languages ??= "";
          sheet.spellcastingAbility ??= null;
          sheet.spellSaveDc ??= 0;
          sheet.spellAttackBonus ??= 0;
          sheet.cantrips ??= "";
          sheet.preparedSpells ??= "";
          sheet.spellSlots ??= {};
          sheet.spellNotes ??= "";
          sheet.classFeatures ??= "";
          sheet.speciesTraits ??= "";
          sheet.backgroundFeature ??= "";
          sheet.feats ??= "";
          sheet.specialAbilities ??= "";
        });
      });

    this.version(13)
      .stores({
        characters: "id, name, updatedAt, createdAt, archivedAt",
        characterSheets: "characterId, updatedAt",
        inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
        inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
        spellbooks: "characterId, updatedAt",
        spells: "id, characterId, level, school, actionType, damageType, updatedAt, [characterId+level]",
        importSessions: "id, status, updatedAt, createdAt",
        importSessionFiles: "id, sessionId, [sessionId+lastModified]",
        characterCreationDrafts: "id, updatedAt",
        soulReaperProgressions: "characterId, level, path, updatedAt",
        pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
        pdfFiles: "documentId",
        pdfBookmarks: "id, documentId, [documentId+page], createdAt",
        settings: "id",
      })
      .upgrade(async (transaction) => {
        await transaction.table("inventoryItems").toCollection().modify((item) => {
          item.source ??= item.category === "Imported" ? "Imported PDF" : "Manual";
        });
        await transaction.table("spells").toCollection().modify((spell) => {
          spell.source ??= spell.homebrew ? "Homebrew" : "Manual";
        });
      });

    this.version(14)
      .stores({
        characters: "id, name, updatedAt, createdAt, archivedAt",
        characterSheets: "characterId, updatedAt",
        inventoryContainers: "id, characterId, [characterId+sortOrder], updatedAt",
        inventoryItems: "id, characterId, containerId, [characterId+containerId], updatedAt",
        spellbooks: "characterId, updatedAt",
        spells: "id, characterId, level, school, actionType, damageType, updatedAt, [characterId+level]",
        importSessions: "id, status, updatedAt, createdAt",
        importSessionFiles: "id, sessionId, [sessionId+lastModified]",
        characterCreationDrafts: "id, updatedAt",
        soulReaperProgressions: "characterId, level, path, updatedAt",
        pdfDocuments: "id, name, gameSystem, updatedAt, *characterIds",
        pdfFiles: "documentId",
        pdfBookmarks: "id, documentId, [documentId+page], createdAt",
        settings: "id",
      })
      .upgrade(async (transaction) => {
        await transaction.table("characterSheets").toCollection().modify((sheet) => {
          sheet.spellSlotsUsed ??= {};
        });
      });

    this.on("populate", () => {
      void this.settings.add(defaultSettings);
    });
  }
}

export const db = new CharacterVaultDatabase();

export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get("app");
  const result = settingsSchema.safeParse(stored);

  if (result.success) return result.data;

  await db.settings.put(defaultSettings);
  return defaultSettings;
}

export async function updateSettings(next: Partial<Omit<AppSettings, "id" | "updatedAt">>) {
  const current = await getSettings();
  const updated = settingsSchema.parse({
    ...current,
    ...next,
    updatedAt: new Date().toISOString(),
  });

  await db.settings.put(updated);
  return updated;
}
