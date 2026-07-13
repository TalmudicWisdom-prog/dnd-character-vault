import { beforeEach, describe, expect, it } from "vitest";
import { createCharacter, deleteCharacter, duplicateCharacter } from "./characters";
import { db } from "./database";
import { srdSpell } from "../rules/srd";
import { catalogSpell, characterSourceClassChoices, findCatalogSpellByName } from "../rules/spellCatalog";
import { addReferenceSpell, addSpellFromCatalog, createReferenceSpellDraft, createSpell, createSpellFromSrd, deleteSpell, duplicateSpell, missingReferenceCompletionFields, movePinnedSpell, replaceCustomSpellWithSrd, saveAndAddReferenceSpell, saveSpell, setSpellPinned } from "./spellbooks";

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

  it("adds complete FFXIV rules and preserves FFXIV associations on canonical SRD spells", async () => {
    const astrologian = await createCharacter({ ...draft("Astrologian"), characterClass: "Astrologian" });
    const aero = findCatalogSpellByName("Aero")!;
    const aeroChoice = characterSourceClassChoices("Astrologian", aero).find((choice) => choice.sourceClass === "Astrologian")!;
    const addedAero = await addSpellFromCatalog(astrologian.id, aero, aeroChoice);

    expect(addedAero).toMatchObject({
      name: "Aero",
      definitionId: "ffxiv-companion-dawntrail:aero",
      rulesSourceId: "ffxiv-companion-dawntrail",
      contentSourceId: "ffxiv-companion-dawntrail",
      definitionVersion: "2025-02-18",
      sourceClass: "Astrologian",
      castingAbilityOverride: "wis",
      sourcePage: 170,
      rulesComplete: true,
    });
    expect(addedAero.description).toContain("burst of wind");

    const whiteMage = await createCharacter({ ...draft("White Mage"), characterClass: "White Mage" });
    const dispelMagic = catalogSpell("dispel-magic")!;
    const whiteMageChoice = characterSourceClassChoices("White Mage", dispelMagic).find((choice) => choice.sourceClass === "White Mage")!;
    const addedDispel = await addSpellFromCatalog(whiteMage.id, dispelMagic, whiteMageChoice);
    expect(addedDispel).toMatchObject({ definitionId: "dispel-magic", rulesSourceId: "srd-5.2.1", contentSourceId: "ffxiv-companion-dawntrail", sourceClass: "White Mage", castingAbilityOverride: "wis" });
  });

  it("does not add a name-only FFXIV entry as a blank cantrip", async () => {
    const character = await createCharacter({ ...draft("Void Mage"), characterClass: "Void Mage" });
    const hunger = findCatalogSpellByName("Hunger of Hadar")!;
    const choice = characterSourceClassChoices("Void Mage", hunger)[0];

    await expect(addSpellFromCatalog(character.id, hunger, choice)).rejects.toThrow("complete rules are unavailable");
    expect(await db.spells.where("characterId").equals(character.id).count()).toBe(0);
  });

  it("prefills an incomplete FFXIV reference and saves a local completed definition without altering the catalog", async () => {
    const character = await createCharacter({ ...draft("Void Mage"), characterClass: "Void Mage" });
    const arms = findCatalogSpellByName("Arms of Hadar")!;
    const choice = characterSourceClassChoices("Void Mage", arms).find((candidate) => candidate.sourceClass === "Void Mage")!;
    const catalogSnapshot = structuredClone(arms);
    const draftSpell = createReferenceSpellDraft(character.id, arms, choice);

    expect(draftSpell).toMatchObject({
      name: "Arms of Hadar",
      level: 1,
      source: "Homebrew",
      homebrew: true,
      rulesSourceId: "ffxiv-companion-dawntrail",
      contentSourceId: "ffxiv-companion-dawntrail",
      referenceDefinitionId: "ffxiv-companion-dawntrail:unavailable:arms-of-hadar",
      sourceClass: "Void Mage",
      castingAbilityOverride: "int",
      rulesComplete: false,
    });
    expect(draftSpell.referenceClasses).toEqual(expect.arrayContaining(["Void Mage", "Reaper", "Pictomancer"]));
    expect(missingReferenceCompletionFields(draftSpell)).toEqual(expect.arrayContaining(["school", "casting time", "range", "duration", "description"]));

    const referenceOnly = await addReferenceSpell(character.id, arms, choice);
    expect(referenceOnly.rulesComplete).toBe(false);
    await expect(addReferenceSpell(character.id, arms, choice)).rejects.toThrow("already owned");

    const completed = await saveAndAddReferenceSpell({
      ...referenceOnly,
      school: "Conjuration",
      castingTime: "1 action",
      actionType: "action",
      range: "10 feet",
      duration: "Instantaneous",
      verbalComponent: true,
      somaticComponent: true,
      description: "User-supplied local spell rules for this character.",
      completionReviewed: true,
    });
    expect(completed).toMatchObject({
      rulesComplete: true,
      referenceDefinitionId: arms.id,
      sourceClass: "Void Mage",
      castingAbilityOverride: "int",
      verbalComponent: true,
      somaticComponent: true,
    });
    expect(await db.spells.where("characterId").equals(character.id).count()).toBe(1);
    expect(arms).toEqual(catalogSnapshot);
  });
});
