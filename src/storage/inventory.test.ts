import { beforeEach, describe, expect, it } from "vitest";
import { createCharacter } from "./characters";
import { db } from "./database";
import {
  createInventoryContainer,
  createInventoryItem,
  duplicateInventoryItem,
  ensureDefaultContainers,
  saveInventoryItem,
} from "./inventory";

const characterDraft = {
  name: "Inventory Tester",
  summary: "",
  playerName: "",
  campaign: "",
  ancestry: "Human",
  characterClass: "Wizard",
  level: 5,
};

describe("inventory item persistence", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("rejects blank names and creates exactly one persisted item per call", async () => {
    const character = await createCharacter(characterDraft);
    const main = (await ensureDefaultContainers(character.id)).find((container) => container.name === "Main Inventory")!;

    await expect(createInventoryItem(character.id, main.id, "   ")).rejects.toThrow("Enter an item name");
    const created = await createInventoryItem(character.id, main.id, "  Arcane Staff  ");

    expect(created.name).toBe("Arcane Staff");
    expect(await db.inventoryItems.where("characterId").equals(character.id).count()).toBe(1);
  });

  it("allows similarly named possessions and duplicates complete item data", async () => {
    const character = await createCharacter(characterDraft);
    const main = (await ensureDefaultContainers(character.id)).find((container) => container.name === "Main Inventory")!;
    const first = await createInventoryItem(character.id, main.id, "Healing Potion");
    await createInventoryItem(character.id, main.id, "Healing Potion");
    const edited = await saveInventoryItem({ ...first, quantity: 3, category: "Potion", equipped: true, favorite: true });
    const copy = await duplicateInventoryItem(character.id, edited.id);

    expect(await db.inventoryItems.where("characterId").equals(character.id).count()).toBe(3);
    expect(copy).toMatchObject({
      name: "Healing Potion copy",
      containerId: main.id,
      quantity: 3,
      category: "Potion",
      equipped: true,
      favorite: true,
      source: "Manual",
    });
    expect(copy.id).not.toBe(edited.id);
  });

  it("survives reopening IndexedDB in default and custom containers", async () => {
    const character = await createCharacter(characterDraft);
    const defaults = await ensureDefaultContainers(character.id);
    const bag = defaults.find((container) => container.name === "Bag of Holding")!;
    const custom = await createInventoryContainer(character.id, "Portable Hole");
    const bagItem = await createInventoryItem(character.id, bag.id, "Rope");
    const customItem = await createInventoryItem(character.id, custom.id, "Moon Key");

    db.close();
    await db.open();

    expect(await db.inventoryItems.get(bagItem.id)).toMatchObject({ name: "Rope", containerId: bag.id });
    expect(await db.inventoryItems.get(customItem.id)).toMatchObject({ name: "Moon Key", containerId: custom.id });
    expect((await db.inventoryContainers.where("characterId").equals(character.id).toArray()).map((container) => container.name)).toEqual(expect.arrayContaining(["Main Inventory", "Bag of Holding", "Void Bag", "Portable Hole"]));
  });
});
