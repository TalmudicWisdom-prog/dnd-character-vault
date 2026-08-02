import { centeredPortraitTransform } from "../domain/models";
import { db } from "../storage/database";

export const PORTRAIT_RECOVERY_SESSION_KEY = "vault:portrait-recovery";

export type PortraitRecoveryState = {
  crashCount: number;
  failedRoute: string;
  recoveryMode: boolean;
  suppressPortraitForCharacterId: string;
};

const emptyRecoveryState: PortraitRecoveryState = {
  crashCount: 0,
  failedRoute: "",
  recoveryMode: false,
  suppressPortraitForCharacterId: "",
};

function sessionStore() {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; } catch { return undefined; }
}

export function characterIdFromRoute(routeHash: string) {
  const match = routeHash.match(/^#?(?:sheet|character|spellbook)\/([^/?#]+)/);
  return match?.[1] ?? "";
}

export function readPortraitRecoveryState(): PortraitRecoveryState {
  try {
    const parsed = JSON.parse(sessionStore()?.getItem(PORTRAIT_RECOVERY_SESSION_KEY) ?? "null") as Partial<PortraitRecoveryState> | null;
    if (!parsed || typeof parsed !== "object") return { ...emptyRecoveryState };
    return {
      crashCount: Number.isFinite(parsed.crashCount) ? Math.max(0, Number(parsed.crashCount)) : 0,
      failedRoute: typeof parsed.failedRoute === "string" ? parsed.failedRoute : "",
      recoveryMode: parsed.recoveryMode === true,
      suppressPortraitForCharacterId: typeof parsed.suppressPortraitForCharacterId === "string" ? parsed.suppressPortraitForCharacterId : "",
    };
  } catch {
    return { ...emptyRecoveryState };
  }
}

function writePortraitRecoveryState(state: PortraitRecoveryState) {
  try { sessionStore()?.setItem(PORTRAIT_RECOVERY_SESSION_KEY, JSON.stringify(state)); } catch { /* Recovery must also work when storage is unavailable. */ }
  return state;
}

export function recordRouteCrash(routeHash: string) {
  const current = readPortraitRecoveryState();
  const sameRoute = current.failedRoute === routeHash;
  return writePortraitRecoveryState({
    crashCount: sameRoute ? current.crashCount + 1 : 1,
    failedRoute: routeHash,
    recoveryMode: true,
    suppressPortraitForCharacterId: characterIdFromRoute(routeHash),
  });
}

export function suppressPortraitForSession(characterId: string, routeHash = "") {
  const current = readPortraitRecoveryState();
  return writePortraitRecoveryState({
    ...current,
    failedRoute: routeHash || current.failedRoute,
    recoveryMode: true,
    suppressPortraitForCharacterId: characterId,
  });
}

export function shouldSuppressPortrait(characterId: string) {
  return Boolean(characterId) && readPortraitRecoveryState().suppressPortraitForCharacterId === characterId;
}

export function safeStartupRoute(routeHash: string) {
  const state = readPortraitRecoveryState();
  return state.recoveryMode && state.failedRoute === routeHash && state.crashCount >= 2 ? "#characters" : routeHash;
}

export function clearPortraitRecoveryState() {
  try { sessionStore()?.removeItem(PORTRAIT_RECOVERY_SESSION_KEY); } catch { /* Session recovery is best-effort. */ }
}

export async function resetCharacterPortraitFraming(characterId: string) {
  if (!characterId) return false;
  const character = await db.characters.get(characterId);
  if (!character) return false;
  await db.characters.update(characterId, {
    portraitTransform: centeredPortraitTransform(),
    updatedAt: new Date().toISOString(),
  });
  return true;
}
