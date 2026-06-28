import { describe, expect, it } from "vitest";
import { applyDamage, applyHealing } from "./hitPoints";

describe("live HP controls", () => {
  it("applies damage to temporary HP first and never drops below zero", () => {
    expect(applyDamage({ currentHp: 12, maxHp: 20, temporaryHp: 5 }, 8)).toMatchObject({
      currentHp: 9,
      maxHp: 20,
      temporaryHp: 0,
      absorbedByTemporaryHp: 5,
    });
    expect(applyDamage({ currentHp: 3, maxHp: 20, temporaryHp: 0 }, 99).currentHp).toBe(0);
  });

  it("applies healing without exceeding max HP", () => {
    expect(applyHealing({ currentHp: 18, maxHp: 20, temporaryHp: 4 }, 10)).toMatchObject({
      currentHp: 20,
      maxHp: 20,
      temporaryHp: 4,
    });
  });
});
