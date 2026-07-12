import type { AbilityId, SpellActionType } from "../domain/models";
import { srdClasses, srdSpells, type SrdSpell } from "./srd";

export const SRD_SPELL_CATALOG_VERSION = "5.2.1";

export type SpellCatalogFilters = {
  query?: string;
  level?: string;
  school?: string;
  concentration?: string;
  ritual?: string;
  actionType?: string;
};

export function normalizeSpellName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
}

export function actionTypeFromCastingTime(castingTime: string): SpellActionType {
  const normalized = castingTime.toLocaleLowerCase();
  if (normalized.includes("bonus action")) return "bonusAction";
  if (normalized.includes("reaction")) return "reaction";
  if (normalized.includes("minute")) return "minute";
  if (normalized.includes("hour")) return "hour";
  if (normalized.includes("action")) return "action";
  return "special";
}

export function searchSrdSpells(filters: SpellCatalogFilters = {}) {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  return srdSpells.filter((spell) => {
    const searchable = [
      spell.name,
      spell.level === 0 ? "cantrip level 0" : `level ${spell.level}`,
      spell.school,
      spell.classes.join(" "),
      spell.description,
      spell.higherLevelScaling ?? "",
    ].join(" ").toLocaleLowerCase();
    return (!query || searchable.includes(query))
      && (!filters.level || filters.level === "all" || spell.level === Number(filters.level))
      && (!filters.school || filters.school === "all" || spell.school === filters.school)
      && (!filters.concentration || filters.concentration === "all" || spell.concentration === (filters.concentration === "yes"))
      && (!filters.ritual || filters.ritual === "all" || spell.ritual === (filters.ritual === "yes"))
      && (!filters.actionType || filters.actionType === "all" || actionTypeFromCastingTime(spell.castingTime) === filters.actionType);
  }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export function findSrdSpellByName(name: string) {
  const normalized = normalizeSpellName(name);
  return srdSpells.find((spell) => normalizeSpellName(spell.name) === normalized);
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function suggestSrdSpells(name: string) {
  const normalized = normalizeSpellName(name);
  if (normalized.length < 3) return [];
  return srdSpells.filter((spell) => {
    const candidate = normalizeSpellName(spell.name);
    return candidate.includes(normalized)
      || normalized.includes(candidate)
      || editDistance(normalized, candidate) <= Math.max(1, Math.floor(candidate.length / 6));
  }).sort((a, b) => editDistance(normalized, normalizeSpellName(a.name)) - editDistance(normalized, normalizeSpellName(b.name)) || a.name.localeCompare(b.name));
}

export function characterSourceClassChoices(characterClass: string, spell: SrdSpell) {
  const normalizedCharacter = characterClass.toLocaleLowerCase();
  const matches = spell.classes.filter((className) => normalizedCharacter.includes(className.toLocaleLowerCase()));
  return matches.length ? matches : spell.classes;
}

const extraSpellcastingAbilities: Record<string, AbilityId> = {
  "void mage": "int",
  "black mage": "int",
};

export function spellcastingAbilityForClass(className: string): AbilityId | null {
  const normalized = className.trim().toLocaleLowerCase();
  if (!normalized) return null;
  return extraSpellcastingAbilities[normalized]
    ?? srdClasses.find((entry) => entry.name.toLocaleLowerCase() === normalized)?.spellcastingAbility
    ?? null;
}
