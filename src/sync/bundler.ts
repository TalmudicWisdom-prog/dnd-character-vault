import { db } from '../storage/database';
import type { CharacterSyncBundle, SyncTombstoneRecord } from './CloudSyncProvider';
import type {
  Character,
  CharacterSheet,
  InventoryContainer,
  InventoryItem,
  PdfBookmark,
  PdfDocument,
  SoulReaperProgression,
  Spell,
  Spellbook,
} from '../domain/models';

/**
 * Compute the effective updatedAt for a character by taking the MAX
 * of all related records' updatedAt timestamps.
 * 
 * @param characterId - The ID of the character
 * @returns The maximum ISO-8601 timestamp, or null if character not found
 */
export async function getCharacterSyncTimestamp(characterId: string): Promise<string | null> {
  const char = await db.characters.get(characterId);
  if (!char) return null;

  let maxTs = char.updatedAt;

  const updateMax = (ts: string | undefined | null) => {
    if (ts && ts > maxTs) {
      maxTs = ts;
    }
  };

  const sheet = await db.characterSheets.get(characterId);
  updateMax(sheet?.updatedAt);

  const containers = await db.inventoryContainers.where('characterId').equals(characterId).toArray();
  containers.forEach((c) => updateMax(c.updatedAt));

  const items = await db.inventoryItems.where('characterId').equals(characterId).toArray();
  items.forEach((i) => updateMax(i.updatedAt));

  const spellbook = await db.spellbooks.get(characterId);
  updateMax(spellbook?.updatedAt);

  const spells = await db.spells.where('characterId').equals(characterId).toArray();
  spells.forEach((s) => updateMax(s.updatedAt));

  const progression = await db.soulReaperProgressions.get(characterId);
  updateMax(progression?.updatedAt);

  const docs = await db.pdfDocuments.where('characterIds').equals(characterId).toArray();
  docs.forEach((d) => updateMax(d.updatedAt));

  const docIds = docs.map((d) => d.id);
  if (docIds.length > 0) {
    const bookmarks = await db.pdfBookmarks.where('documentId').anyOf(docIds).toArray();
    bookmarks.forEach((b) => updateMax(b.createdAt)); // createdAt serves as updatedAt for bookmarks
  }

  return maxTs;
}

/**
 * Assemble a CharacterSyncBundle from all Dexie tables for a single character.
 * The bundle contains:
 * - character record (with portraitDataUrl OMITTED to keep bundle lightweight)
 * - characterSheet (1:1)
 * - inventory containers and items (1:N)
 * - spellbook (1:1) and spells (1:N)
 * - soulReaperProgression (1:1)
 * - pdfDocuments metadata (no binary data) and pdfBookmarks
 * - portrait: { assetHash, transform } — the hash is computed from portraitDataUrl
 * - tombstones for this character
 * 
 * The bundle's updatedAt is the MAX of all related records' updatedAt values.
 * 
 * @param characterId - The ID of the character to assemble
 * @param tombstones - The tombstones associated with this character
 * @param portraitHash - The computed asset hash for the portrait, if any
 * @returns The populated bundle, or null if the character doesn't exist
 */
export async function assembleBundle(
  characterId: string,
  tombstones: SyncTombstoneRecord[],
  portraitHash: string | null,
): Promise<CharacterSyncBundle | null> {
  const character = await db.characters.get(characterId);
  if (!character) return null;

  const sheet = await db.characterSheets.get(characterId);
  const containers = await db.inventoryContainers.where('characterId').equals(characterId).toArray();
  const items = await db.inventoryItems.where('characterId').equals(characterId).toArray();
  const spellbook = await db.spellbooks.get(characterId);
  const spells = await db.spells.where('characterId').equals(characterId).toArray();
  const soulReaperProgression = await db.soulReaperProgressions.get(characterId);
  const pdfDocuments = await db.pdfDocuments.where('characterIds').equals(characterId).toArray();

  const docIds = pdfDocuments.map((d) => d.id);
  const pdfBookmarks = docIds.length > 0
    ? await db.pdfBookmarks.where('documentId').anyOf(docIds).toArray()
    : [];

  const updatedAt = (await getCharacterSyncTimestamp(characterId)) || character.updatedAt;

  const bundleCharacter = { ...character, portraitDataUrl: "" } as unknown as Record<string, unknown>;

  return {
    formatVersion: 1,
    characterId,
    updatedAt,
    character: bundleCharacter,
    sheet: (sheet as unknown as Record<string, unknown>) || null,
    inventory: {
      containers: containers as unknown as Record<string, unknown>[],
      items: items as unknown as Record<string, unknown>[],
    },
    spellbook: (spellbook as unknown as Record<string, unknown>) || null,
    spells: spells as unknown as Record<string, unknown>[],
    soulReaperProgression: (soulReaperProgression as unknown as Record<string, unknown>) || null,
    pdfDocuments: pdfDocuments as unknown as Record<string, unknown>[],
    pdfBookmarks: pdfBookmarks as unknown as Record<string, unknown>[],
    portrait: {
      assetHash: portraitHash,
      transform: character.portraitTransform as unknown as Record<string, unknown>,
    },
    tombstones,
  };
}

/**
 * Disassemble a CharacterSyncBundle back into individual Dexie table records.
 * This is used when pulling remote changes — it writes the bundle's data
 * into the local Dexie database.
 * 
 * Uses db.transaction for atomicity.
 * Uses table.put() so it upserts (creates or overwrites).
 * 
 * @param bundle - The sync bundle to apply to the database
 * @param portraitDataUrl - The hydrated portrait data URL (downloaded separately)
 */
export async function disassembleBundle(
  bundle: CharacterSyncBundle,
  portraitDataUrl: string,
): Promise<void> {
  await db.transaction('rw', [
    db.characters,
    db.characterSheets,
    db.inventoryContainers,
    db.inventoryItems,
    db.spellbooks,
    db.spells,
    db.soulReaperProgressions,
    db.pdfDocuments,
    db.pdfBookmarks
  ], async () => {
    // 1. Character
    const char = bundle.character as unknown as Character;
    char.portraitDataUrl = portraitDataUrl;
    await db.characters.put(char);

    // 2. Character Sheet
    if (bundle.sheet) {
      await db.characterSheets.put(bundle.sheet as unknown as CharacterSheet);
    } else {
      await db.characterSheets.delete(bundle.characterId);
    }

    // 3. Inventory Containers
    const localContainers = await db.inventoryContainers.where('characterId').equals(bundle.characterId).primaryKeys();
    const bundleContainerIds = new Set(bundle.inventory.containers.map((c) => String(c.id)));
    const containersToDelete = localContainers.filter((id) => !bundleContainerIds.has(String(id)));
    if (containersToDelete.length > 0) await db.inventoryContainers.bulkDelete(containersToDelete);

    for (const container of bundle.inventory.containers) {
      await db.inventoryContainers.put(container as unknown as InventoryContainer);
    }

    // 4. Inventory Items
    const localItems = await db.inventoryItems.where('characterId').equals(bundle.characterId).primaryKeys();
    const bundleItemIds = new Set(bundle.inventory.items.map((i) => String(i.id)));
    const itemsToDelete = localItems.filter((id) => !bundleItemIds.has(String(id)));
    if (itemsToDelete.length > 0) await db.inventoryItems.bulkDelete(itemsToDelete);

    for (const item of bundle.inventory.items) {
      await db.inventoryItems.put(item as unknown as InventoryItem);
    }

    // 5. Spellbook and Spells
    if (bundle.spellbook) {
      await db.spellbooks.put(bundle.spellbook as unknown as Spellbook);
    } else {
      await db.spellbooks.delete(bundle.characterId);
    }

    const localSpells = await db.spells.where('characterId').equals(bundle.characterId).primaryKeys();
    const bundleSpellIds = new Set(bundle.spells.map((s) => String(s.id)));
    const spellsToDelete = localSpells.filter((id) => !bundleSpellIds.has(String(id)));
    if (spellsToDelete.length > 0) await db.spells.bulkDelete(spellsToDelete);

    for (const spell of bundle.spells) {
      await db.spells.put(spell as unknown as Spell);
    }

    // 6. Soul Reaper Progression
    if (bundle.soulReaperProgression) {
      await db.soulReaperProgressions.put(bundle.soulReaperProgression as unknown as SoulReaperProgression);
    } else {
      await db.soulReaperProgressions.delete(bundle.characterId);
    }

    // 7. PDF Documents and Bookmarks
    const localDocsForChar = await db.pdfDocuments.where('characterIds').equals(bundle.characterId).toArray();
    const bundleDocIds = new Set(bundle.pdfDocuments.map((d) => String(d.id)));

    // For any local document this character was linked to, but isn't in the new bundle,
    // we unlink the character from it.
    for (const localDoc of localDocsForChar) {
      if (!bundleDocIds.has(localDoc.id)) {
        localDoc.characterIds = localDoc.characterIds.filter((id) => id !== bundle.characterId);
        await db.pdfDocuments.put(localDoc);
      }
    }

    // For documents in the bundle, we upsert and merge characterIds
    for (const doc of bundle.pdfDocuments) {
      const typedDoc = doc as unknown as PdfDocument;
      const existingDoc = await db.pdfDocuments.get(typedDoc.id);
      if (existingDoc) {
        typedDoc.characterIds = Array.from(new Set([...existingDoc.characterIds, ...typedDoc.characterIds]));
      }
      await db.pdfDocuments.put(typedDoc);
    }

    // Upsert bookmarks
    for (const bookmark of bundle.pdfBookmarks) {
      await db.pdfBookmarks.put(bookmark as unknown as PdfBookmark);
    }
  });
}

/**
 * Serialize a bundle to a JSON ArrayBuffer for cloud upload.
 * 
 * @param bundle - The bundle to serialize
 * @returns The serialized JSON as an ArrayBuffer
 */
export function serializeBundle(bundle: CharacterSyncBundle): ArrayBuffer {
  const jsonStr = JSON.stringify(bundle);
  return new TextEncoder().encode(jsonStr).buffer;
}

/**
 * Deserialize a JSON ArrayBuffer back into a CharacterSyncBundle.
 * 
 * @param data - The ArrayBuffer to deserialize
 * @returns The deserialized CharacterSyncBundle
 */
export function deserializeBundle(data: ArrayBuffer): CharacterSyncBundle {
  const jsonStr = new TextDecoder().decode(data);
  return JSON.parse(jsonStr) as CharacterSyncBundle;
}
