export type DieSize = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export type DiceRollPart = {
  count: number;
  sides: DieSize;
  rolls: number[];
  subtotal: number;
  sign: 1 | -1;
};

export type DiceRollResult = {
  id: string;
  formula: string;
  total: number;
  parts: DiceRollPart[];
  modifier: number;
  breakdown: string;
  rolledAt: string;
};

const allowedDice = new Set([4, 6, 8, 10, 12, 20, 100]);

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function rollDie(sides: DieSize, random: () => number) {
  return Math.floor(random() * sides) + 1;
}

export function normalizeFormula(formula: string) {
  return formula.toLocaleLowerCase().replace(/\s+/g, "");
}

export function parseDiceFormula(formula: string) {
  const normalized = normalizeFormula(formula);
  if (!normalized) throw new Error("Enter a dice formula");
  const tokens = normalized.match(/[+-]?[^+-]+/g);
  if (!tokens?.length) throw new Error("Enter a dice formula");

  const parsed = tokens.map((token) => {
    const sign: 1 | -1 = token.startsWith("-") ? -1 : 1;
    const body = token.replace(/^[+-]/, "");
    const diceMatch = body.match(/^(\d*)d(\d+)$/);
    if (diceMatch) {
      const count = diceMatch[1] ? Number(diceMatch[1]) : 1;
      const sides = Number(diceMatch[2]);
      if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("Dice count must be between 1 and 100");
      if (!allowedDice.has(sides)) throw new Error(`Unsupported die: d${sides}`);
      return { type: "dice" as const, count, sides: sides as DieSize, sign };
    }
    const value = Number(body);
    if (!Number.isInteger(value)) throw new Error(`Could not understand "${token}"`);
    return { type: "modifier" as const, value, sign };
  });

  return parsed;
}

export function rollFormula(formula: string, random: () => number = Math.random): DiceRollResult {
  const parsed = parseDiceFormula(formula);
  const parts: DiceRollPart[] = [];
  let modifier = 0;
  for (const token of parsed) {
    if (token.type === "modifier") {
      modifier += token.value * token.sign;
      continue;
    }
    const rolls = Array.from({ length: token.count }, () => rollDie(token.sides, random));
    const subtotal = rolls.reduce((total, roll) => total + roll, 0);
    parts.push({ count: token.count, sides: token.sides, rolls, subtotal, sign: token.sign });
  }
  const diceTotal = parts.reduce((total, part) => total + part.subtotal * part.sign, 0);
  const total = diceTotal + modifier;
  return {
    id: randomId(),
    formula: normalizeFormula(formula),
    total,
    parts,
    modifier,
    breakdown: formatRollBreakdown(parts, modifier, total),
    rolledAt: new Date().toISOString(),
  };
}

export function formatRollBreakdown(parts: DiceRollPart[], modifier: number, total: number) {
  const diceText = parts.map((part) => {
    const sign = part.sign === -1 ? "- " : "";
    return `${sign}${part.count}d${part.sides} [${part.rolls.join(", ")}]`;
  });
  const modifierText = modifier ? `${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}` : "";
  return [...diceText, modifierText].filter(Boolean).join(" ") + ` = ${total}`;
}

export function roll4d6DropLowest(random: () => number = Math.random) {
  const rolls = Array.from({ length: 4 }, () => rollDie(6, random)).sort((a, b) => a - b);
  const kept = rolls.slice(1);
  return {
    rolls,
    kept,
    dropped: rolls[0],
    total: kept.reduce((total, roll) => total + roll, 0),
  };
}

export function rollSixAbilityScores(random: () => number = Math.random) {
  return Array.from({ length: 6 }, () => roll4d6DropLowest(random));
}

export function addRollToHistory(history: DiceRollResult[], roll: DiceRollResult, limit = 10) {
  return [roll, ...history].slice(0, limit);
}
