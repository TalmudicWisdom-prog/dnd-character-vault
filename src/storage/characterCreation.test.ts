import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./database";
import { createCharacter } from "./characters";
import { createCharacterFromCreationDraft, getOrCreateCreationDraft, saveCreationDraft } from "./characterCreation";
import { saveCharacterSheet } from "./characterSheets";

describe("guided character creation", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates a character with full sheet fields, equipment, and spells", async () => {
    const draft = await getOrCreateCreationDraft();
    const saved = await saveCreationDraft({
      ...draft,
      character: {
        ...draft.character,
        name: "Nyx",
        characterClass: "Wizard",
        ancestry: "Elf",
        background: "Sage",
        level: 5,
        concept: "Careful battlefield scholar",
        backstory: "Raised in a tower library.",
      },
      sheet: {
        ...draft.sheet,
        abilityScores: { ...draft.sheet.abilityScores, int: 18, dex: 14 },
        maxHp: 32,
        currentHp: 32,
        hitDice: "5d6",
        armorProficiencies: "None",
        languages: "Common, Elvish",
        cantrips: "Mage Hand",
        preparedSpells: "Shield\nFireball",
        spellSlots: { "1": 4, "2": 3, "3": 2 },
        classFeatures: "Arcane Recovery",
      },
      equipment: [{ id: crypto.randomUUID(), name: "Spellbook", quantity: 1, notes: "Blue cover", equipped: false }],
    });
    const character = await createCharacterFromCreationDraft(saved);
    const sheet = await db.characterSheets.get(character.id);
    const items = await db.inventoryItems.where("characterId").equals(character.id).toArray();
    const spells = await db.spells.where("characterId").equals(character.id).toArray();

    expect(character.background).toBe("Sage");
    expect(character.concept).toBe("Careful battlefield scholar");
    expect(sheet?.abilityScores.int).toBe(18);
    expect(sheet?.proficiencyBonus).toBe(3);
    expect(sheet?.spellSlots["3"]).toBe(2);
    expect(items.map((item) => item.name)).toContain("Spellbook");
    expect(spells.map((spell) => spell.name)).toEqual(expect.arrayContaining(["Mage Hand", "Shield", "Fireball"]));
  });

  it("saves draft progress locally before the character is created", async () => {
    const draft = await getOrCreateCreationDraft();
    await saveCreationDraft({
      ...draft,
      step: 11,
      character: {
        ...draft.character,
        name: "Saved Draft",
        characterClass: "Ranger",
        ancestry: "Human",
      },
    });

    const reloaded = await getOrCreateCreationDraft();
    const createdCharacters = await db.characters.toArray();

    expect(reloaded.step).toBe(11);
    expect(reloaded.character.name).toBe("Saved Draft");
    expect(createdCharacters).toEqual([]);
  });

  it("applies defaults for older minimal character drafts", async () => {
    const character = await createCharacter({ name: "Old Style", characterClass: "Fighter", ancestry: "Human" });
    expect(character.background).toBe("");
    expect(character.backstory).toBe("");
    expect(character.level).toBe(1);
  });

  it("saves editable character sheet fields", async () => {
    const character = await createCharacter({ name: "Editor", characterClass: "Rogue", ancestry: "Halfling" });
    await db.characterSheets.put({
      characterId: character.id,
      abilityScores: { str: 10, dex: 16, con: 12, int: 13, wis: 10, cha: 8 },
      proficiencyBonus: 2,
      currentHp: 8,
      maxHp: 8,
      temporaryHp: 0,
      armorClass: 14,
      initiative: 3,
      speed: 25,
      hitDice: "1d8",
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      attacks: "",
      weapons: "",
      damageNotes: "",
      savingThrows: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
      skillProficiencies: {
        acrobatics: true, animalHandling: false, arcana: false, athletics: false, deception: true, history: false,
        insight: false, intimidation: false, investigation: false, medicine: false, nature: false, perception: true,
        performance: false, persuasion: false, religion: false, sleightOfHand: true, stealth: true, survival: false,
      },
      armorProficiencies: "",
      weaponProficiencies: "",
      toolProficiencies: "",
      languages: "",
      spellcastingAbility: null,
      spellSaveDc: 0,
      spellAttackBonus: 0,
      cantrips: "",
      preparedSpells: "",
      spellSlots: {},
      spellNotes: "",
      classFeatures: "",
      speciesTraits: "",
      backgroundFeature: "",
      feats: "",
      specialAbilities: "",
      notes: "",
      updatedAt: new Date().toISOString(),
    });
    const updated = await saveCharacterSheet({ ...(await db.characterSheets.get(character.id))!, currentHp: 3, temporaryHp: 5, notes: "Poisoned" });
    expect(updated.currentHp).toBe(3);
    expect(updated.temporaryHp).toBe(5);
    expect((await db.characterSheets.get(character.id))?.notes).toBe("Poisoned");
  });
});
