import { beforeEach, describe, expect, it } from "vitest";
import { extractCharacterText } from "./extract";
import { saveCharacterImport } from "./saveImport";
import { db } from "../storage/database";

describe("reviewed character imports", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates character-scoped sheet and inventory data only after review", async () => {
    const draft = extractCharacterText("Character Name: Rowan\nStrength 16\nArmor Class: 17\nInventory\nRope\nTorch", "rowan.txt");
    draft.armorClass.include = false;
    const id = await saveCharacterImport(draft, "create");
    const character = await db.characters.get(id);
    const sheet = await db.characterSheets.get(id);
    const items = await db.inventoryItems.where("characterId").equals(id).toArray();

    expect(character?.name).toBe("Rowan");
    expect(sheet?.abilityScores.str).toBe(16);
    expect(sheet?.armorClass).toBe(10);
    expect(items.map((item) => item.name)).toContain("Rope");
    expect(items.every((item) => item.characterId === id)).toBe(true);
  });

  it("does not overwrite unchecked fields while merging", async () => {
    const original = extractCharacterText("Character Name: Existing\nDexterity 14", "existing.txt");
    const id = await saveCharacterImport(original, "create");
    const merge = extractCharacterText("Character Name: Replacement\nDexterity 20", "merge.txt");
    merge.name.include = false;
    await saveCharacterImport(merge, "merge", id);
    expect((await db.characters.get(id))?.name).toBe("Existing");
    expect((await db.characterSheets.get(id))?.abilityScores.dex).toBe(20);
  });
});
