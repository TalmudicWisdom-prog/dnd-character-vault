import type { AbilityId } from "../../domain/models";
import { roll4d6DropLowest as rollAbilityDice, rollSixAbilityScores as rollSixAbilityDiceScores } from "../../dice/dice";

export const standardArrayScores = [15, 14, 13, 12, 10, 8] as const;
export const pointBuyBudget = 27;
export const pointBuyCosts: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export function pointBuyCost(score: number) {
  return pointBuyCosts[score] ?? Number.POSITIVE_INFINITY;
}

export function pointBuySpent(scores: Record<AbilityId, number>) {
  return Object.values(scores).reduce((total, score) => total + pointBuyCost(score), 0);
}

export function pointBuyRemaining(scores: Record<AbilityId, number>) {
  return pointBuyBudget - pointBuySpent(scores);
}

export function isLegalPointBuy(scores: Record<AbilityId, number>) {
  return Object.values(scores).every((score) => score >= 8 && score <= 15 && Number.isFinite(pointBuyCost(score))) && pointBuyRemaining(scores) >= 0;
}

export function clampPointBuyScore(score: number) {
  return Math.max(8, Math.min(15, Math.round(score || 8)));
}

export function roll4d6DropLowest(random: () => number = Math.random) {
  return rollAbilityDice(random).total;
}

export function rollSixAbilityScores(random: () => number = Math.random) {
  return rollSixAbilityDiceScores(random).map((roll) => roll.total);
}

export function usedAssignedScores(assignments: Partial<Record<AbilityId, number | null>>) {
  const counts = new Map<number, number>();
  for (const value of Object.values(assignments)) {
    if (value == null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function scoreIsAvailable(score: number, availableScores: readonly number[], assignments: Partial<Record<AbilityId, number | null>>, currentAbility: AbilityId) {
  const used = usedAssignedScores({ ...assignments, [currentAbility]: null });
  const availableCount = availableScores.filter((value) => value === score).length;
  return (used.get(score) ?? 0) < availableCount;
}
