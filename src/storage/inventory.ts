import type { InventoryContainer, InventoryItem } from "../domain/models";
import { inventoryContainerSchema, inventoryItemSchema } from "../domain/models";
import { db } from "./database";

const defaultContainerNames = ["Main Inventory", "Bag of Holding", "Void Bag"] as const;
const containerInitialization = new Map<string, Promise<InventoryContainer[]>>();

function now() {
  return new Date().toISOString();
}

export async function ensureDefaultContainers(characterId: string) {
  const pending = containerInitialization.get(characterId);
  if (pending) return pending;

  const initialization = db.transaction("rw", [db.inventoryContainers, db.inventoryItems], async () => {
    const existing = await db.inventoryContainers.where("characterId").equals(characterId).sortBy("sortOrder");
    if (existing.length > 0) {
      const firstByName = new Map<string, InventoryContainer>();
      for (const container of existing) {
        const destination = firstByName.get(container.name);
        if (!destination) {
          firstByName.set(container.name, container);
          continue;
        }
        await db.inventoryItems.where("[characterId+containerId]").equals([characterId, container.id]).modify({ containerId: destination.id });
        await db.inventoryContainers.delete(container.id);
      }
      return [...firstByName.values()];
    }

    const timestamp = now();
    const containers = defaultContainerNames.map((name, sortOrder) => inventoryContainerSchema.parse({
      id: crypto.randomUUID(),
      characterId,
      name,
      sortOrder,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    await db.inventoryContainers.bulkAdd(containers);
    return containers;
  });
  containerInitialization.set(characterId, initialization);
  void initialization.then(
    () => containerInitialization.delete(characterId),
    () => containerInitialization.delete(characterId),
  );
  return initialization;
}

export async function createInventoryContainer(characterId: string, name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Enter a container name");
  const count = await db.inventoryContainers.where("characterId").equals(characterId).count();
  const timestamp = now();
  const container = inventoryContainerSchema.parse({
    id: crypto.randomUUID(),
    characterId,
    name: trimmedName,
    sortOrder: count,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.inventoryContainers.add(container);
  return container;
}

export async function createInventoryItem(characterId: string, containerId: string, name: string) {
  const container = await db.inventoryContainers.get(containerId);
  if (!container || container.characterId !== characterId) throw new Error("Container does not belong to this character");
  const timestamp = now();
  const item = inventoryItemSchema.parse({
    id: crypto.randomUUID(),
    characterId,
    containerId,
    name: name.trim(),
    quantity: 1,
    category: "",
    description: "",
    equipped: false,
    favorite: false,
    customRulesText: "",
    effectsAndStats: "",
    source: "Manual",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.inventoryItems.add(item);
  return item;
}

export async function saveInventoryItem(item: InventoryItem) {
  const current = await db.inventoryItems.get(item.id);
  if (!current || current.characterId !== item.characterId) throw new Error("Item does not belong to this character");
  const container = await db.inventoryContainers.get(item.containerId);
  if (!container || container.characterId !== item.characterId) throw new Error("Container does not belong to this character");

  const updated = inventoryItemSchema.parse({ ...item, updatedAt: now() });
  await db.inventoryItems.put(updated);
  await db.characters.update(item.characterId, { updatedAt: updated.updatedAt });
  return updated;
}

export async function deleteInventoryItem(characterId: string, itemId: string) {
  const item = await db.inventoryItems.get(itemId);
  if (!item || item.characterId !== characterId) throw new Error("Item does not belong to this character");
  await db.inventoryItems.delete(itemId);
}

export async function deleteInventoryContainer(characterId: string, containerId: string) {
  const container = await db.inventoryContainers.get(containerId);
  if (!container || container.characterId !== characterId) throw new Error("Container does not belong to this character");
  const main = await db.inventoryContainers.where("characterId").equals(characterId).sortBy("sortOrder");
  const destination = main.find((candidate) => candidate.id !== containerId);
  if (!destination) throw new Error("A character must have at least one container");

  await db.transaction("rw", db.inventoryContainers, db.inventoryItems, async () => {
    await db.inventoryItems.where("[characterId+containerId]").equals([characterId, containerId]).modify({ containerId: destination.id });
    await db.inventoryContainers.delete(containerId);
  });
}

export async function copyInventory(sourceCharacterId: string, targetCharacterId: string) {
  const sourceContainers = await db.inventoryContainers.where("characterId").equals(sourceCharacterId).sortBy("sortOrder");
  if (!sourceContainers.length) return;
  const sourceItems = await db.inventoryItems.where("characterId").equals(sourceCharacterId).toArray();
  const timestamp = now();
  const containerIds = new Map<string, string>();
  const containers: InventoryContainer[] = sourceContainers.map((container) => {
    const id = crypto.randomUUID();
    containerIds.set(container.id, id);
    return { ...container, id, characterId: targetCharacterId, createdAt: timestamp, updatedAt: timestamp };
  });
  const items: InventoryItem[] = sourceItems.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    characterId: targetCharacterId,
    containerId: containerIds.get(item.containerId) ?? containers[0].id,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  await db.transaction("rw", db.inventoryContainers, db.inventoryItems, async () => {
    await db.inventoryContainers.bulkAdd(containers);
    await db.inventoryItems.bulkAdd(items);
  });
}
