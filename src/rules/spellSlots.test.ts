import { describe, expect, it, vi } from "vitest";
import { changeUsedSpellSlots, remainingSpellSlots, resetUsedSpellSlots, shouldConfirmLongRest } from "./spellSlots";

describe("spell slot tracking", () => {
  it("tracks used and remaining slots manually", () => {
    expect(changeUsedSpellSlots(3, 0, 1)).toBe(1);
    expect(changeUsedSpellSlots(3, 3, 1)).toBe(3);
    expect(changeUsedSpellSlots(3, 0, -1)).toBe(0);
    expect(remainingSpellSlots(3, 2)).toBe(1);
  });

  it("resets used slots on long rest", () => {
    expect(resetUsedSpellSlots({ "1": 2, "2": 1 })).toEqual({ "1": 0, "2": 0 });
  });

  it("asks for confirmation before resetting used spell slots", () => {
    const confirm = vi.fn(() => false);
    expect(shouldConfirmLongRest(true, confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(shouldConfirmLongRest(false, confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
