import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractCharacterText } from "./extract";
import { saveCharacterImport } from "./saveImport";
import { db } from "../storage/database";
import { extractDndBeyondSpellData } from "./pdfSpells";
import { createSpell } from "../storage/spellbooks";

const formField = (name: string, value: string) => ({ name, value });

function akivaDraft() {
  const spellData = extractDndBeyondSpellData([
    formField("spellCastingAbility0", "WIS"), formField("spellSaveDC0", "16"), formField("spellAtkBonus0", "+8"), formField("spellCastingClass0", "Druid"),
    formField("spellHeader0", "=== CANTRIPS ==="), formField("spellName0", "Mold Earth"), formField("spellPrepared0", "P"), formField("spellSource0", "Druid"),
    formField("spellHeader1", "=== 1st LEVEL ==="), formField("spellName1", "Thunderwave"), formField("spellPrepared1", "P"), formField("spellSource1", "Druid"),
    formField("spellName2", "Buzzing Bee"), formField("spellPrepared2", "O"), formField("spellSource2", "Druid (Always Prepared)"),
  ]);
  return extractCharacterText("Character Name: Akiva\nClass & Level: Druid 14\nRace: Wood Elf", "Akiva Character D&D.pdf", spellData);
}

describe("reviewed character imports", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates character-scoped sheet and inventory data only after review", async () => {
    const draft = extractCharacterText("Character Name: Rowan\nStrength 16\nArmor Class: 17\nInventory\nRope\nTorch", "rowan.txt");
    draft.armorClass.include = false;
    const { characterId: id } = await saveCharacterImport(draft, "create");
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
    const { characterId: id } = await saveCharacterImport(original, "create");
    const merge = extractCharacterText("Character Name: Replacement\nDexterity 20", "merge.txt");
    merge.name.include = false;
    await saveCharacterImport(merge, "merge", id);
    expect((await db.characters.get(id))?.name).toBe("Existing");
    expect((await db.characterSheets.get(id))?.abilityScores.dex).toBe(20);
  });

  it("persists matched and custom imported spells under the newly created character ID", async () => {
    const result = await saveCharacterImport(akivaDraft(), "create", undefined, [{
      id: crypto.randomUUID(), sessionId: crypto.randomUUID(), name: "Akiva Character D&D.pdf", type: "application/pdf",
      size: 4, lastModified: 1, pageCount: 8, data: new Blob(["pdf"], { type: "application/pdf" }),
    }]);
    const spells = await db.spells.where("characterId").equals(result.characterId).toArray();
    const sheet = await db.characterSheets.get(result.characterId);

    expect(result.spells).toMatchObject({ detected: 3, imported: 3, matched: 1, custom: 2, skippedExisting: 0 });
    expect(spells).toHaveLength(3);
    expect(spells.every((spell) => spell.characterId === result.characterId)).toBe(true);
    expect(spells.find((spell) => spell.name === "Thunderwave")?.definitionId).toBeTruthy();
    expect(spells.find((spell) => spell.name === "Buzzing Bee")).toMatchObject({ homebrew: true, imported: true, rulesComplete: false, alwaysPrepared: true });
    expect(sheet).toMatchObject({ spellcastingAbility: "wis", spellSaveDc: 16, spellAttackBonus: 8 });
    expect(sheet?.cantrips).toContain("Mold Earth");
    expect(sheet?.preparedSpells).toContain("Thunderwave");
    expect(await db.pdfDocuments.filter((document) => document.characterIds.includes(result.characterId)).count()).toBe(1);

    await db.close();
    await db.open();
    expect(await db.spells.where("characterId").equals(result.characterId).count()).toBe(3);
  });

  it("re-imports into an existing character without duplicates or cross-character writes", async () => {
    const cloud = await saveCharacterImport(extractCharacterText("Character Name: Cloud", "cloud.txt"), "create");
    await createSpell(cloud.characterId, "Cloud Ward");
    const akiva = await saveCharacterImport(akivaDraft(), "create");
    const retry = await saveCharacterImport(akivaDraft(), "merge", akiva.characterId);

    expect(retry.spells).toMatchObject({ imported: 0, skippedExisting: 3 });
    expect(await db.spells.where("characterId").equals(akiva.characterId).count()).toBe(3);
    expect((await db.spells.where("characterId").equals(cloud.characterId).toArray()).map((spell) => spell.name)).toEqual(["Cloud Ward"]);
  });

  it("rolls back a new character when spell persistence fails", async () => {
    vi.spyOn(db.spells, "bulkAdd").mockRejectedValueOnce(new Error("Simulated spell write failure"));
    await expect(saveCharacterImport(akivaDraft(), "create")).rejects.toThrow("Simulated spell write failure");
    expect(await db.characters.count()).toBe(0);
    expect(await db.spells.count()).toBe(0);
  });

  it("reports zero detected spells without claiming a populated spellbook", async () => {
    const result = await saveCharacterImport(extractCharacterText("Character Name: No Magic", "empty.pdf"), "create");
    expect(result.spells).toEqual({ detected: 0, imported: 0, matched: 0, custom: 0, skippedExisting: 0 });
    expect(await db.spells.where("characterId").equals(result.characterId).count()).toBe(0);
  });
});
