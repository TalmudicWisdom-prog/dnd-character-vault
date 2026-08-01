import type { Character } from "../domain/models";
import { db } from "../storage/database";

export const ACTIVE_CHARACTER_STORAGE_KEY = "vault:active-character-id";
export const ACTIVE_CHARACTER_CHANGED_EVENT = "vault:active-character-changed";
export const PENDING_SHEET_SECTION_KEY = "vault:pending-sheet-section";
export const CHARACTER_ANNOUNCEMENT_KEY = "vault:character-announcement";

function browserStorage() {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function activeCharacterId() {
  return browserStorage()?.getItem(ACTIVE_CHARACTER_STORAGE_KEY) ?? "";
}

export function rankAvailableCharacters(characters: readonly Character[]) {
  return [...characters]
    .filter((character) => !character.archivedAt)
    .sort((left, right) => {
      if (left.favorite !== right.favorite) return left.favorite ? -1 : 1;
      const leftOpened = left.lastOpenedAt ?? left.updatedAt;
      const rightOpened = right.lastOpenedAt ?? right.updatedAt;
      return rightOpened.localeCompare(leftOpened) || left.name.localeCompare(right.name);
    });
}

export function rememberActiveCharacterId(characterId: string | null) {
  const storage = browserStorage();
  if (!storage) return;
  if (characterId) storage.setItem(ACTIVE_CHARACTER_STORAGE_KEY, characterId);
  else storage.removeItem(ACTIVE_CHARACTER_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(ACTIVE_CHARACTER_CHANGED_EVENT, { detail: { characterId } }));
}

export async function activateCharacter(characterId: string) {
  const character = await db.characters.get(characterId);
  if (!character || character.archivedAt) return null;
  const lastOpenedAt = new Date().toISOString();
  await db.characters.update(characterId, { lastOpenedAt });
  rememberActiveCharacterId(characterId);
  return { ...character, lastOpenedAt };
}

export async function resolveActiveCharacter(excludingId = "") {
  const available = rankAvailableCharacters(await db.characters.toArray())
    .filter((character) => character.id !== excludingId);
  const rememberedId = activeCharacterId();
  const active = available.find((character) => character.id === rememberedId) ?? available[0] ?? null;
  rememberActiveCharacterId(active?.id ?? null);
  return active;
}

export async function replaceUnavailableActiveCharacter(unavailableId: string) {
  if (activeCharacterId() !== unavailableId) return resolveActiveCharacter();
  return resolveActiveCharacter(unavailableId);
}

export function rememberPendingSheetSection(targetId: string) {
  if (typeof window !== "undefined") window.sessionStorage.setItem(PENDING_SHEET_SECTION_KEY, targetId);
}

export function takePendingSheetSection() {
  if (typeof window === "undefined") return "";
  const targetId = window.sessionStorage.getItem(PENDING_SHEET_SECTION_KEY) ?? "";
  window.sessionStorage.removeItem(PENDING_SHEET_SECTION_KEY);
  return targetId;
}

export function queueCharacterAnnouncement(message: string) {
  if (typeof window !== "undefined") window.sessionStorage.setItem(CHARACTER_ANNOUNCEMENT_KEY, message);
}

export function takeCharacterAnnouncement() {
  if (typeof window === "undefined") return "";
  const message = window.sessionStorage.getItem(CHARACTER_ANNOUNCEMENT_KEY) ?? "";
  window.sessionStorage.removeItem(CHARACTER_ANNOUNCEMENT_KEY);
  return message;
}
