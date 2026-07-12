import { beforeEach, describe, expect, it } from "vitest";
import { createCharacter, deleteCharacter, duplicateCharacter } from "./characters";
import { db } from "./database";
import { srdSpell } from "../rules/srd";
import { addSpellFromCatalog, createSpell, createSpellFromSrd, deleteSpell, duplicateSpell, movePinnedSpell, replaceCustomSpellWithSrd, saveSpell, setSpellPinned } from "./spellbooks";

const draft = (name: string) => ({
  name, summary: "", playerName: "", campaign: "", ancestry: "", characterClass: "", level: 1,
});

describe("character-scoped spellbooks", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates, edits, pins, reorders, duplicates, and deletes spells within one character", async () => {
    const first = await createCharacter(draft("First Mage"));
    const second = await createCharacter(draft("Second Mage"));
    const fire = await createSpell(first.id, "Fire Spell");
    const frost = await createSpell(first.id, "Frost Spell");
    await saveSpell({ ...fire, damageType: "Fire", damageFormula: "8d6" });
    await setSpellPinned(first.id, fire.id, true);
    await setSpellPinned(first.id, frost.id, true);
    await movePinnedSpell(first.id, frost.id, -1);

    const book = await db.spellbooks.get(first.id);
    expect(book?.pinnedSpellIds).toEqual([frost.id, fire.id]);
    expect(await db.spells.where("characterId").equals(second.id).count()).toBe(0);
    await expect(setSpellPinned(second.id, fire.id, true)).rejects.toThrow("does not belong");

    const copiedSpell = await duplicateSpell(first.id, fire.id);
    expect(copiedSpell.name).toBe("Fire Spell Copy");
    await deleteSpell(first.id, fire.id);
    expect((await db.spellbooks.get(first.id))?.pinnedSpellIds).not.toContain(fire.id);
  });

  it("copies and deletes the complete spellbook with its character", async () => {
    const original = await createCharacter(draft("Original Mage"));
    const spell = await createSpell(original.id, "Ward");
    await setSpellPinned(original.id, spell.id, true);
    const copy = await duplicateCharacter(original.id);

    const copiedSpells = await db.spells.where("characterId").equals(copy.id).toArray();
    const copiedBook = await db.spellbooks.get(copy.id);
    expect(copiedSpells).toHaveLength(1);
    expect(copiedBook?.pinnedSpellIds).toEqual([copiedSpells[0].id]);

    await deleteCharacter(original.id);
    expect(await db.spells.where("characterId").equals(original.id).count()).toBe(0);
    expect(await db.spellbooks.get(original.id)).toBeUndefined();
    expect(await db.spells.where("characterId").equals(copy.id).count()).toBe(1);
  });

  it("populates SRD spell metadata when importing a spell", async () => {
    const character = await createCharacter(draft("SRD Mage"));
    const thunderwave = srdSpell("thunderwave");
    expect(thunderwave).toBeTruthy();

    const spell = createSpellFromSrd(character.id, thunderwave!);

    expect(spell).toMatchObject({
      name: "Thunderwave",
      level: 1,
      school: "Evocation",
      castingTime: "Action",
      actionType: "action",
      range: "Self",
      verbalComponent: true,
      somaticComponent: true,
      duration: "Instantaneous",
      concentration: false,
      ritual: false,
      damageType: "Thunder",
      damageFormula: "2d8",
      savingThrowType: "CON",
      areaOfEffectType: "Cube",
      areaOfEffectSize: "15-foot cube",
      source: "SRD",
      homebrew: false,
    });
    expect(spell.description).toContain("thunderous energy");
    expect(spell.higherLevelScaling).toContain("spell slot level above 1");
  });

  it("adds Dispel Magic as a linked SRD definition rather than a custom cantrip", async () => {
    const character = await createCharacter(draft("Druid"));
    const definition = srdSpell("dispel-magic")!;
    const spell = await addSpellFromCatalog(character.id, definition, "Druid");

    expect(spell).toMatchObject({
      name: "Dispel Magic",
      level: 3,
      school: "Abjuration",
      source: "SRD",
      homebrew: false,
      definitionId: "dispel-magic",
      definitionVersion: "5.2.1",
      sourceClass: "Druid",
      verbalComponent: true,
      somaticComponent: true,
      materialComponent: false,
      attackRollRequired: false,
      savingThrowType: "",
    });
    expect(spell.description).toContain("ongoing spell");
    expect(spell.higherLevelScaling).toContain("automatically end");
    await expect(addSpellFromCatalog(character.id, definition, "Druid")).rejects.toThrow("already owned");
    expect(await db.spells.where("characterId").equals(character.id).count()).toBe(1);
  });

  it("keeps explicit custom creation and safely repairs an exact-name custom spell", async () => {
    const character = await createCharacter(draft("Druid"));
    const custom = await createSpell(character.id, "Dispel Magic");
    const annotated = await saveSpell({ ...custom, notes: "Keep this note" });
    await setSpellPinned(character.id, custom.id, true);

    expect(custom).toMatchObject({ level: 0, school: "Custom", source: "Homebrew", homebrew: true, definitionId: "" });
    const repaired = await replaceCustomSpellWithSrd(annotated, srdSpell("dispel-magic")!, "Druid");
    expect(repaired).toMatchObject({ id: custom.id, level: 3, source: "SRD", homebrew: false, notes: "Keep this note" });
    expect((await db.spellbooks.get(character.id))?.pinnedSpellIds).toContain(custom.id);
  });
});
