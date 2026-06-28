import type { AbilityId, CharacterSheet } from "../domain/models";
import { abilityModifier, formatModifier } from "../domain/dndMath";

export type RollAssistantMode = "beginner" | "veteran";

export type RollAssistantRow = {
  id: string;
  label: string;
  formula: string;
  bonus: number | null;
  rollable: boolean;
  explanation: string;
};

const abilityLabels: Record<AbilityId, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

function d20Formula(bonus: number) {
  return `d20${formatModifier(bonus)}`;
}

function firstD20Formula(value: string) {
  const match = value.match(/d20\s*([+-]\s*\d+)?/i);
  if (!match) return null;
  return `d20${(match[1] ?? "+0").replace(/\s+/g, "")}`;
}

function formulaBonus(formula: string) {
  const match = formula.match(/d20([+-]\d+)?$/i);
  return match?.[1] ? Number(match[1]) : 0;
}

export function savingThrowBonus(sheet: CharacterSheet, ability: AbilityId) {
  return abilityModifier(sheet.abilityScores[ability] ?? 10) + (sheet.savingThrows[ability] ? sheet.proficiencyBonus : 0);
}

export function buildRollAssistantRows(sheet: CharacterSheet): RollAssistantRow[] {
  const rows: RollAssistantRow[] = [
    {
      id: "initiative",
      label: "Initiative",
      formula: d20Formula(sheet.initiative),
      bonus: sheet.initiative,
      rollable: true,
      explanation: "You rolled Initiative. This determines turn order in combat and uses the Initiative bonus saved on this sheet.",
    },
  ];

  for (const ability of (["str", "dex", "con", "int", "wis", "cha"] satisfies AbilityId[])) {
    const bonus = savingThrowBonus(sheet, ability);
    const proficient = sheet.savingThrows[ability] ?? false;
    rows.push({
      id: `${ability}-save`,
      label: `${abilityLabels[ability]} Save`,
      formula: d20Formula(bonus),
      bonus,
      rollable: true,
      explanation: `You rolled a ${abilityLabels[ability]} saving throw. This uses your ${abilityLabels[ability]} modifier${proficient ? " plus your proficiency bonus because this character is proficient in that save" : "; this character is not marked proficient in that save"}.`,
    });
  }

  rows.push({
    id: "spell-attack",
    label: "Spell Attack",
    formula: d20Formula(sheet.spellAttackBonus),
    bonus: sheet.spellAttackBonus,
    rollable: true,
    explanation: "You rolled a spell attack. This uses the spell attack bonus saved on this character sheet.",
  });

  rows.push({
    id: "spell-save-dc",
    label: "Spell Save DC",
    formula: String(sheet.spellSaveDc || 0),
    bonus: null,
    rollable: false,
    explanation: "Spell Save DC is the number the target rolls against. You usually do not roll this; the target rolls a saving throw.",
  });

  const weaponFormula = firstD20Formula(`${sheet.attacks}\n${sheet.weapons}`) ?? "d20+0";
  rows.push({
    id: "weapon-attack",
    label: "Weapon Attack",
    formula: weaponFormula,
    bonus: formulaBonus(weaponFormula),
    rollable: true,
    explanation: firstD20Formula(`${sheet.attacks}\n${sheet.weapons}`)
      ? "You rolled a weapon attack using the first d20 formula found in your attack or weapon notes."
      : "No weapon attack formula was found in your notes yet, so this rolls a plain d20. Add a formula like d20+7 to Attacks or Weapons to make this smarter.",
  });

  return rows;
}
