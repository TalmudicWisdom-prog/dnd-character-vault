import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rememberScroll, restoreScroll } from "./sessionRestore";

describe("route scroll restoration", () => {
  const values = new Map<string, string>();
  const scrollTo = vi.fn();

  beforeEach(() => {
    values.clear();
    scrollTo.mockClear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("window", {
      location: { hash: "#spellbook/active-character" },
      scrollY: 1640,
      scrollTo,
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("stores outgoing scroll under the previous route after the hash has changed", () => {
    rememberScroll("#sheet/active-character");

    expect(values.get("vault:scroll:#sheet/active-character")).toBe("1640");
    expect(values.has("vault:scroll:#spellbook/active-character")).toBe(false);
  });

  it("restores the saved position for the current route", () => {
    values.set("vault:scroll:#spellbook/active-character", "920");

    restoreScroll();

    expect(scrollTo).toHaveBeenCalledWith({ top: 920, left: 0, behavior: "auto" });
  });
});
