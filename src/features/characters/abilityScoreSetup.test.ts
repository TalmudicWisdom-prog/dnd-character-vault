import { describe, expect, it } from "vitest";
import type { AbilityId } from "../../domain/models";
import {
  isLegalPointBuy,
  pointBuyRemaining,
  roll4d6DropLowest,
  scoreIsAvailable,
  standardArrayScores,
} from "./abilityScoreSetup";

const baseScores: Record<AbilityId, number> = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };

describe("ability score setup", () => {
  it("tracks point buy points and rejects illegal totals", () => {
    expect(pointBuyRemaining(baseScores)).toBe(27);
    expect(isLegalPointBuy({ ...baseScores, str: 15, dex: 15, con: 15, int: 15 })).toBe(false);
    expect(isLegalPointBuy({ ...baseScores, str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })).toBe(true);
  });

  it("prevents using a standard array score more than once", () => {
    const assignments: Record<AbilityId, number | null> = { str: 15, dex: null, con: null, int: null, wis: null, cha: null };
    expect(scoreIsAvailable(15, standardArrayScores, assignments, "dex")).toBe(false);
    expect(scoreIsAvailable(15, standardArrayScores, assignments, "str")).toBe(true);
  });

  it("rolls 4d6 and drops the lowest die", () => {
    const values = [0, 0.5, 0.99, 0.25];
    let index = 0;
    const roll = roll4d6DropLowest(() => values[index++]);
    expect(roll).toBe(12);
  });
});
