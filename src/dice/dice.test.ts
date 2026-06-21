import { describe, expect, it } from "vitest";
import { addRollToHistory, roll4d6DropLowest, rollFormula } from "./dice";

describe("dice roller", () => {
  it("rolls dice formulas with modifiers", () => {
    const values = [0, 0.5];
    let index = 0;
    const result = rollFormula("2d6+3", () => values[index++]);
    expect(result.total).toBe(8);
    expect(result.parts[0].rolls).toEqual([1, 4]);
    expect(result.breakdown).toContain("2d6 [1, 4]");
    expect(result.breakdown).toContain("+ 3");
  });

  it("supports d20 and d100 formulas", () => {
    expect(rollFormula("d20", () => 0.99).total).toBe(20);
    expect(rollFormula("d100", () => 0).total).toBe(1);
  });

  it("rolls 4d6 and drops the lowest die", () => {
    const values = [0, 0.5, 0.99, 0.25];
    let index = 0;
    const result = roll4d6DropLowest(() => values[index++]);
    expect(result.rolls).toEqual([1, 2, 4, 6]);
    expect(result.dropped).toBe(1);
    expect(result.total).toBe(12);
  });

  it("keeps newest roll history first", () => {
    const first = rollFormula("d4", () => 0);
    const second = rollFormula("d6", () => 0);
    expect(addRollToHistory(addRollToHistory([], first), second).map((roll) => roll.formula)).toEqual(["d6", "d4"]);
  });
});
