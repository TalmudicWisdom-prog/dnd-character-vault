import { describe, expect, it } from "vitest";
import { createEmptyCharacterSheet } from "../storage/characterSheets";
import { createEmptySpell } from "../storage/spellbooks";
import {
  canCastSpellWithSlot,
  consumeSpellSlot,
  extractDiceFormulas,
  isSpellPrepared,
  spellAttackModifier,
  spellRollOptions,
  spellSaveDifficulty,
  validSpellSlotChoices,
  validSpellSlotLevels,
} from "./spellCasting";

describe("spell casting helpers", () => {
  it("detects spell attack, damage, healing, and other dice formulas", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    sheet.spellAttackBonus = 7;
    const spell = {
      ...createEmptySpell(sheet.characterId, "Radiant Bloom"),
      attackRollRequired: true,
      damageType: "Radiant",
      damageFormula: "2d8 radiant",
      healingFormula: "1d6 + 2",
      description: "The target glows and can add 1d4 to one check.",
    };

    expect(extractDiceFormulas(spell.description)).toEqual(["1d4"]);
    expect(spellRollOptions(spell, sheet)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "attack", formula: "d20+7" }),
      expect.objectContaining({ kind: "damage", formula: "2d8" }),
      expect.objectContaining({ kind: "healing", formula: "1d6+2" }),
      expect.objectContaining({ kind: "other", formula: "1d4" }),
    ]));
  });

  it("falls back to spellcasting ability and proficiency when attack and save fields are unset", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    sheet.spellcastingAbility = "wis";
    sheet.abilityScores.wis = 18;
    sheet.proficiencyBonus = 3;
    sheet.spellAttackBonus = 0;
    sheet.spellSaveDc = 0;

    expect(spellAttackModifier(sheet)).toBe(7);
    expect(spellSaveDifficulty(sheet)).toBe(15);
  });

  it("tracks prepared status from cantrip and prepared spell names", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    const cantrip = createEmptySpell(sheet.characterId, "Guidance");
    const leveled = { ...createEmptySpell(sheet.characterId, "Cure Wounds"), level: 1 };
    sheet.cantrips = "Guidance";
    sheet.preparedSpells = "Cure Wounds";

    expect(isSpellPrepared(sheet, cantrip)).toBe(true);
    expect(isSpellPrepared(sheet, leveled)).toBe(true);
  });

  it("only allows valid slot levels and consumes the selected slot", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    const spell = { ...createEmptySpell(sheet.characterId, "Thunderwave"), level: 1 };
    sheet.spellSlots = { "1": 2, "2": 1 };
    sheet.spellSlotsUsed = { "1": 2, "2": 0 };

    expect(validSpellSlotLevels(sheet, spell)).toEqual([2]);
    expect(validSpellSlotChoices(sheet, spell)).toEqual([{ pool: "spellSlots", level: 2 }]);
    expect(canCastSpellWithSlot(sheet, spell, 1)).toBe(false);
    expect(canCastSpellWithSlot(sheet, spell, 2)).toBe(true);
    expect(consumeSpellSlot(sheet, spell, 2).spellSlotsUsed["2"]).toBe(1);
  });

  it("upcasting consumes the selected higher-level slot", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    const spell = { ...createEmptySpell(sheet.characterId, "Cure Wounds"), level: 1 };
    sheet.spellSlots = { "1": 1, "2": 1 };
    sheet.spellSlotsUsed = { "1": 0, "2": 0 };

    const cast = consumeSpellSlot(sheet, spell, { pool: "spellSlots", level: 2 });

    expect(cast.spellSlotsUsed).toMatchObject({ "1": 0, "2": 1 });
  });

  it("separates Pact Magic slot consumption from normal spell slots", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    const spell = { ...createEmptySpell(sheet.characterId, "Hex"), level: 1 };
    sheet.spellSlots = { "1": 1 };
    sheet.spellSlotsUsed = { "1": 0 };
    sheet.pactMagicSlots = { "2": 1 };
    sheet.pactMagicSlotsUsed = { "2": 0 };

    const cast = consumeSpellSlot(sheet, spell, { pool: "pactMagic", level: 2 });

    expect(cast.spellSlotsUsed["1"]).toBe(0);
    expect(cast.pactMagicSlotsUsed["2"]).toBe(1);
  });

  it("does not consume slots for cantrips and blocks leveled spells with no remaining slot", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    const cantrip = createEmptySpell(sheet.characterId, "Fire Bolt");
    const leveled = { ...createEmptySpell(sheet.characterId, "Shield"), level: 1 };

    expect(consumeSpellSlot(sheet, cantrip, null).spellSlotsUsed).toEqual(sheet.spellSlotsUsed);
    expect(canCastSpellWithSlot(sheet, leveled, 1)).toBe(false);
    expect(() => consumeSpellSlot(sheet, leveled, 1)).toThrow("No valid spell slot");
  });
});
