import type { CharacterSheet, Spell } from "../domain/models";
import { abilityModifier, formatModifier } from "../domain/dndMath";
import { changeUsedSpellSlots, remainingSpellSlots, type SlotPoolId } from "./spellSlots";
import { spellcastingAbilityForClass } from "./spellCatalog";

export type SpellRollKind = "attack" | "damage" | "healing" | "other";

export type SpellRollOption = {
  id: string;
  label: string;
  kind: SpellRollKind;
  formula: string;
  source: string;
};

export type SpellSlotChoice = {
  pool: SlotPoolId;
  level: number;
};

const diceFormulaPattern = /(?:\b\d*)d(?:4|6|8|10|12|20|100)\b(?:\s*[+-]\s*\d+)?/gi;

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractDiceFormulas(value: string) {
  return uniqueValues((value.match(diceFormulaPattern) ?? []).map((formula) => formula.replace(/\s+/g, "")));
}

export function spellcastingAbilityModifier(sheet: CharacterSheet) {
  return sheet.spellcastingAbility ? abilityModifier(sheet.abilityScores[sheet.spellcastingAbility] ?? 10) : 0;
}

export function spellAttackModifier(sheet: CharacterSheet) {
  if (sheet.spellAttackBonus !== 0) return sheet.spellAttackBonus;
  return sheet.spellcastingAbility ? spellcastingAbilityModifier(sheet) + sheet.proficiencyBonus : 0;
}

export function spellSaveDifficulty(sheet: CharacterSheet) {
  if (sheet.spellSaveDc > 0) return sheet.spellSaveDc;
  return sheet.spellcastingAbility ? 8 + sheet.proficiencyBonus + spellcastingAbilityModifier(sheet) : 0;
}

export function resolvedSpellcastingAbility(spell: Spell, sheet: CharacterSheet) {
  return spell.castingAbilityOverride
    ?? spellcastingAbilityForClass(spell.sourceClass)
    ?? (!spell.definitionId ? sheet.spellcastingAbility : null);
}

export function spellDetailStatistics(spell: Spell, sheet: CharacterSheet) {
  const ability = resolvedSpellcastingAbility(spell, sheet);
  const resolvedSheet = { ...sheet, spellcastingAbility: ability };
  return {
    ability,
    abilityModifier: ability ? spellcastingAbilityModifier(resolvedSheet) : null,
    saveDc: spell.savingThrowType && ability ? spellSaveDifficulty(resolvedSheet) : null,
    spellAttack: spell.attackRollRequired && ability ? spellAttackModifier(resolvedSheet) : null,
    setupWarning: Boolean((spell.savingThrowType || spell.attackRollRequired) && !ability),
  };
}

function spellNameLines(value: string) {
  return value.split(/\r?\n|,/).map((line) => line.trim().toLocaleLowerCase()).filter(Boolean);
}

export function isSpellPrepared(sheet: CharacterSheet, spell: Spell) {
  const name = spell.name.trim().toLocaleLowerCase();
  const cantrips = spellNameLines(sheet.cantrips);
  const prepared = spellNameLines(sheet.preparedSpells);
  return spell.level === 0 ? cantrips.includes(name) || prepared.includes(name) : prepared.includes(name);
}

export function validSpellSlotLevels(sheet: CharacterSheet, spell: Spell) {
  if (spell.level === 0) return [];
  return Array.from({ length: 10 - spell.level }, (_, index) => spell.level + index)
    .filter((level) => {
      const maximum = sheet.spellSlots[String(level)] ?? 0;
      const used = sheet.spellSlotsUsed[String(level)] ?? 0;
      return remainingSpellSlots(maximum, used) > 0;
    });
}

export function validSpellSlotChoices(sheet: CharacterSheet, spell: Spell): SpellSlotChoice[] {
  if (spell.level === 0) return [];
  const levels = Array.from({ length: 10 - spell.level }, (_, index) => spell.level + index);
  return levels.flatMap((level) => {
    const choices: SpellSlotChoice[] = [];
    const normalMaximum = sheet.spellSlots[String(level)] ?? 0;
    const normalUsed = sheet.spellSlotsUsed[String(level)] ?? 0;
    if (remainingSpellSlots(normalMaximum, normalUsed) > 0) choices.push({ pool: "spellSlots", level });
    const pactMaximum = sheet.pactMagicSlots[String(level)] ?? 0;
    const pactUsed = sheet.pactMagicSlotsUsed[String(level)] ?? 0;
    if (remainingSpellSlots(pactMaximum, pactUsed) > 0) choices.push({ pool: "pactMagic", level });
    return choices;
  });
}

function normalizeSlotChoice(choice: SpellSlotChoice | number | null): SpellSlotChoice | null {
  if (typeof choice === "number") return { pool: "spellSlots", level: choice };
  return choice;
}

export function canCastSpellWithSlot(sheet: CharacterSheet, spell: Spell, slotChoice: SpellSlotChoice | number | null) {
  if (spell.level === 0) return true;
  const choice = normalizeSlotChoice(slotChoice);
  if (!choice || choice.level < spell.level || choice.level > 9) return false;
  const maximum = choice.pool === "pactMagic" ? sheet.pactMagicSlots[String(choice.level)] ?? 0 : sheet.spellSlots[String(choice.level)] ?? 0;
  const used = choice.pool === "pactMagic" ? sheet.pactMagicSlotsUsed[String(choice.level)] ?? 0 : sheet.spellSlotsUsed[String(choice.level)] ?? 0;
  return remainingSpellSlots(maximum, used) > 0;
}

export function canCastSpell(sheet: CharacterSheet, spell: Spell, slotChoice: SpellSlotChoice | number | null) {
  return spell.rulesComplete && (spell.level === 0 || canCastSpellWithSlot(sheet, spell, slotChoice));
}

export function consumeSpellSlot(sheet: CharacterSheet, spell: Spell, slotChoice: SpellSlotChoice | number | null) {
  if (spell.level === 0) return sheet;
  const choice = normalizeSlotChoice(slotChoice);
  if (!choice || !canCastSpellWithSlot(sheet, spell, choice)) throw new Error("No valid spell slot remains for that casting level.");
  const level = String(choice.level);
  return choice.pool === "pactMagic"
    ? {
        ...sheet,
        pactMagicSlotsUsed: {
          ...sheet.pactMagicSlotsUsed,
          [level]: changeUsedSpellSlots(sheet.pactMagicSlots[level] ?? 0, sheet.pactMagicSlotsUsed[level] ?? 0, 1),
        },
      }
    : {
        ...sheet,
        spellSlotsUsed: {
          ...sheet.spellSlotsUsed,
          [level]: changeUsedSpellSlots(sheet.spellSlots[level] ?? 0, sheet.spellSlotsUsed[level] ?? 0, 1),
        },
      };
}

export function spellSlotSummary(sheet: CharacterSheet, level: number) {
  const key = String(level);
  const maximum = sheet.spellSlots[key] ?? 0;
  const used = Math.min(sheet.spellSlotsUsed[key] ?? 0, maximum);
  return { maximum, used, remaining: remainingSpellSlots(maximum, used) };
}

export function spellComponents(spell: Spell) {
  return [
    spell.verbalComponent && "V",
    spell.somaticComponent && "S",
    spell.materialComponent && "M",
  ].filter(Boolean).join(", ") || "None";
}

export function spellRollOptions(spell: Spell, sheet: CharacterSheet): SpellRollOption[] {
  const options: SpellRollOption[] = [];
  if (spell.attackRollRequired && (sheet.spellcastingAbility || sheet.spellAttackBonus !== 0)) {
    options.push({
      id: "spell-attack",
      label: "Spell attack",
      kind: "attack",
      formula: `d20${formatModifier(spellAttackModifier(sheet))}`,
      source: "Spell attack bonus",
    });
  }

  for (const formula of extractDiceFormulas(spell.damageFormula)) {
    options.push({ id: `damage-${options.length}`, label: spell.damageType ? `${spell.damageType} damage` : "Damage", kind: "damage", formula, source: "Damage formula" });
  }
  for (const formula of extractDiceFormulas(spell.healingFormula)) {
    options.push({ id: `healing-${options.length}`, label: "Healing", kind: "healing", formula, source: "Healing formula" });
  }

  const primaryFormulas = new Set(options.map((option) => option.formula.toLocaleLowerCase()));
  const otherText = [spell.statusEffects, spell.description, spell.higherLevelScaling].join("\n");
  for (const formula of extractDiceFormulas(otherText).filter((formula) => !primaryFormulas.has(formula.toLocaleLowerCase()))) {
    options.push({ id: `other-${options.length}`, label: "Other roll", kind: "other", formula, source: "Spell text" });
  }

  return options;
}
