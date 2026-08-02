import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { createEmptyCharacterSheet, saveCharacterSheet } from "../storage/characterSheets";
import { createCharacter } from "../storage/characters";
import { db } from "../storage/database";
import {
  clearPortraitRecoveryState,
  PORTRAIT_RECOVERY_SESSION_KEY,
  readPortraitRecoveryState,
  recordRouteCrash,
  resetCharacterPortraitFraming,
  safeStartupRoute,
  shouldSuppressPortrait,
  suppressPortraitForSession,
} from "./portraitRecovery";

function browserStorage() {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe("portrait startup recovery", () => {
  const session = browserStorage();
  const local = browserStorage();

  beforeEach(async () => {
    session.clear();
    local.clear();
    vi.stubGlobal("window", {
      location: { hash: "#sheet/hero-id" },
      localStorage: local,
      sessionStorage: session,
    });
    await db.delete();
    await db.open();
  });

  it("suppresses only the affected portrait after one crash and enters vault safe mode after a repeated crash", () => {
    recordRouteCrash("#sheet/hero-id");
    expect(shouldSuppressPortrait("hero-id")).toBe(true);
    expect(safeStartupRoute("#sheet/hero-id")).toBe("#sheet/hero-id");

    recordRouteCrash("#sheet/hero-id");
    expect(safeStartupRoute("#sheet/hero-id")).toBe("#characters");
    expect(readPortraitRecoveryState()).toMatchObject({ recoveryMode: true, crashCount: 2, suppressPortraitForCharacterId: "hero-id" });
  });

  it("stores no transient editor candidate, object URL, drag, pinch, or unsaved transform state", () => {
    suppressPortraitForSession("hero-id", "#sheet/hero-id");
    const stored = session.getItem(PORTRAIT_RECOVERY_SESSION_KEY) ?? "";
    expect(stored).not.toContain("blob:");
    expect(stored).not.toContain("pendingImage");
    expect(stored).not.toContain("drag");
    expect(stored).not.toContain("pinch");
    expect(stored).not.toContain("zoom");
  });

  it("returns to normal after recovery is cleared", () => {
    recordRouteCrash("#sheet/hero-id");
    clearPortraitRecoveryState();
    expect(shouldSuppressPortrait("hero-id")).toBe(false);
    expect(safeStartupRoute("#sheet/hero-id")).toBe("#sheet/hero-id");
  });

  it("resets only portrait framing while preserving the active character and sheet data", async () => {
    const character = await createCharacter({
      name: "Akiva",
      summary: "Preserve me",
      ancestry: "Human",
      characterClass: "Wizard",
      level: 8,
      portraitDataUrl: "data:image/jpeg;base64,akiva",
      portraitImageId: "akiva-original",
      portraitTransform: { zoom: 3, offsetX: -0.4, offsetY: 0.2, version: 1, updatedAt: "2026-08-01T12:00:00.000Z" },
    });
    await saveCharacterSheet({ ...createEmptyCharacterSheet(character.id), notes: "Important session notes", currentHp: 27, maxHp: 42 });
    local.setItem("vault:active-character-id", character.id);

    expect(await resetCharacterPortraitFraming(character.id)).toBe(true);

    const restored = await db.characters.get(character.id);
    expect(restored).toMatchObject({ name: "Akiva", summary: "Preserve me", portraitDataUrl: "data:image/jpeg;base64,akiva", portraitImageId: "akiva-original" });
    expect(restored?.portraitTransform).toEqual({ zoom: 1, offsetX: 0, offsetY: 0, version: 1, updatedAt: null });
    expect(await db.characterSheets.get(character.id)).toMatchObject({ notes: "Important session notes", currentHp: 27, maxHp: 42 });
    expect(local.getItem("vault:active-character-id")).toBe(character.id);
  });

  it("offers targeted recovery instead of a destructive clear-data action", () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.state = { actionStatus: "", characterId: "hero-id", error: new Error("Portrait failed"), failedRoute: "#sheet/hero-id" };
    const markup = renderToStaticMarkup(boundary.render());
    expect(markup).toContain("Try Again");
    expect(markup).toContain("Open Character Without Portrait");
    expect(markup).toContain("Reset This Character’s Portrait Framing");
    expect(markup).toContain("Return to Character Vault");
    expect(markup).not.toContain("Clear site data");
  });
});
