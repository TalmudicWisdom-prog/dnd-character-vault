import type { AbilityId, RulesSource, SpellActionType } from "../domain/models";
import ffxivCatalogJson from "../data/ffxiv-companion-dawntrail.data?raw";
import {
  contentSource,
  defaultEnabledContentSourceIds,
  FFXIV_CONTENT_SOURCE_ID,
  SRD_CONTENT_SOURCE_ID,
} from "./contentSources";
import { srdClasses, srdSpells, type SrdSpell } from "./srd";

export const SRD_SPELL_CATALOG_VERSION = "5.2.1";

export type SpellDefinitionStatus = "complete" | "unavailable";

export type CatalogSpellAssociation = {
  spellName: string;
  definitionId: string;
  contentSourceId: string;
  rulesSourceId: string;
  status: "srd" | "complete" | "unavailable";
  className: string;
  subclassName: string;
  sourceClass: string;
  castingAbility: AbilityId | null;
  page: number | null;
  listedLevel: number | null;
};

export type CatalogSourceChoice = CatalogSpellAssociation & {
  value: string;
  label: string;
};

export type CatalogSpellDefinition = {
  id: string;
  name: string;
  level: number | null;
  school: string;
  classes: string[];
  castingTime: string;
  range: string;
  components: string[];
  materialDetails: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  damageType?: string;
  damageFormula?: string;
  healingFormula?: string;
  areaOfEffectType?: string;
  areaOfEffectSize?: string;
  savingThrowType?: string;
  attackRollRequired?: boolean;
  statusEffects?: string;
  higherLevelScaling?: string;
  description: string;
  source: RulesSource;
  rulesSourceId: string;
  sourceVersion: string;
  sourcePage: number | null;
  homebrew: boolean;
  definitionStatus: SpellDefinitionStatus;
  associations: CatalogSpellAssociation[];
  contentSourceIds: string[];
};

export type SpellCatalogFilters = {
  query?: string;
  level?: string;
  school?: string;
  concentration?: string;
  ritual?: string;
  actionType?: string;
  source?: string;
};

type FfxivPack = {
  source: { id: string; displayName: string; shortLabel: string; sourceType: string; version: string };
  classAbilities: Record<string, AbilityId>;
  definitions: Array<Omit<CatalogSpellDefinition, "classes" | "source" | "associations" | "contentSourceIds">>;
  associations: CatalogSpellAssociation[];
  review: {
    spellNamesDetected: number;
    completeCustomDefinitions: number;
    srdMatches: number;
    incompleteNamedOnlyEntries: number;
    ambiguousEntries: number;
    classListAssociations: number;
    classesAndSubclasses: string[];
  };
};

const ffxivPack = JSON.parse(ffxivCatalogJson) as FfxivPack;
const ffxivAssociationsByDefinition = new Map<string, CatalogSpellAssociation[]>();
for (const association of ffxivPack.associations) {
  const existing = ffxivAssociationsByDefinition.get(association.definitionId) ?? [];
  existing.push(association);
  ffxivAssociationsByDefinition.set(association.definitionId, existing);
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function canonicalAssociation(spell: SrdSpell, className: string): CatalogSpellAssociation {
  return {
    spellName: spell.name,
    definitionId: spell.id,
    contentSourceId: SRD_CONTENT_SOURCE_ID,
    rulesSourceId: SRD_CONTENT_SOURCE_ID,
    status: "srd",
    className,
    subclassName: "",
    sourceClass: className,
    castingAbility: srdClasses.find((entry) => entry.name === className)?.spellcastingAbility ?? null,
    page: null,
    listedLevel: spell.level,
  };
}

function fromSrdSpell(spell: SrdSpell): CatalogSpellDefinition {
  const associations = [
    ...spell.classes.map((className) => canonicalAssociation(spell, className)),
    ...(ffxivAssociationsByDefinition.get(spell.id) ?? []),
  ];
  return {
    ...spell,
    level: spell.level,
    source: "SRD",
    rulesSourceId: SRD_CONTENT_SOURCE_ID,
    sourceVersion: spell.sourceVersion ?? SRD_SPELL_CATALOG_VERSION,
    sourcePage: null,
    homebrew: false,
    definitionStatus: "complete",
    associations,
    classes: uniqueValues(associations.map((association) => association.sourceClass)),
    contentSourceIds: uniqueValues(associations.map((association) => association.contentSourceId)),
  };
}

function fromFfxivDefinition(definition: FfxivPack["definitions"][number]): CatalogSpellDefinition {
  const associations = ffxivAssociationsByDefinition.get(definition.id) ?? [];
  return {
    ...definition,
    source: "Homebrew",
    associations,
    classes: uniqueValues(associations.map((association) => association.sourceClass)),
    contentSourceIds: uniqueValues([FFXIV_CONTENT_SOURCE_ID, ...associations.map((association) => association.contentSourceId)]),
  };
}

export const catalogSpells: CatalogSpellDefinition[] = [
  ...srdSpells.map(fromSrdSpell),
  ...ffxivPack.definitions.map(fromFfxivDefinition),
];

export const ffxivSpellImportSummary = ffxivPack.review;

export function normalizeSpellName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
}

function primarySpellName(value: string) {
  return value.replace(/\s*\([^)]*\)\s*$/, "");
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

function enabledAssociations(spell: CatalogSpellDefinition, enabledSourceIds: string[]) {
  return spell.associations.filter((association) => association.contentSourceId === SRD_CONTENT_SOURCE_ID || enabledSourceIds.includes(association.contentSourceId));
}

function sourceEnabled(spell: CatalogSpellDefinition, enabledSourceIds: string[]) {
  return spell.rulesSourceId === SRD_CONTENT_SOURCE_ID || enabledSourceIds.includes(spell.rulesSourceId);
}

export function searchCatalogSpells(filters: SpellCatalogFilters = {}, enabledSourceIds = defaultEnabledContentSourceIds) {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  return catalogSpells.filter((spell) => {
    const associations = enabledAssociations(spell, enabledSourceIds);
    const searchableSources = uniqueValues([spell.rulesSourceId, ...associations.map((association) => association.contentSourceId)])
      .flatMap((sourceId) => {
        const source = contentSource(sourceId);
        return source ? [source.id, source.displayName, source.shortLabel, source.sourceType] : [sourceId];
      });
    const searchable = [
      spell.name,
      spell.level === null ? "level unknown definition unavailable" : spell.level === 0 ? "cantrip level 0" : `level ${spell.level}`,
      spell.school,
      ...associations.flatMap((association) => [association.className, association.subclassName, association.sourceClass]),
      ...searchableSources,
      spell.description,
      spell.higherLevelScaling ?? "",
      spell.definitionStatus === "unavailable" ? "definition unavailable incomplete" : "complete",
    ].join(" ").toLocaleLowerCase();
    const sourceFilterMatches = !filters.source || filters.source === "all"
      ? sourceEnabled(spell, enabledSourceIds)
      : filters.source === "homebrew"
        ? spell.homebrew && sourceEnabled(spell, enabledSourceIds)
        : filters.source === SRD_CONTENT_SOURCE_ID
          ? spell.rulesSourceId === SRD_CONTENT_SOURCE_ID
          : enabledSourceIds.includes(filters.source) && (spell.rulesSourceId === filters.source || associations.some((association) => association.contentSourceId === filters.source));
    return sourceFilterMatches
      && (!query || searchable.includes(query))
      && (!filters.level || filters.level === "all" || spell.level === Number(filters.level))
      && (!filters.school || filters.school === "all" || spell.school === filters.school)
      && (!filters.concentration || filters.concentration === "all" || spell.concentration === (filters.concentration === "yes"))
      && (!filters.ritual || filters.ritual === "all" || spell.ritual === (filters.ritual === "yes"))
      && (!filters.actionType || filters.actionType === "all" || spell.definitionStatus === "complete" && actionTypeFromCastingTime(spell.castingTime) === filters.actionType);
  }).sort((a, b) => (a.level ?? 10) - (b.level ?? 10) || a.name.localeCompare(b.name));
}

export function searchSrdSpells(filters: SpellCatalogFilters = {}) {
  return searchCatalogSpells({ ...filters, source: SRD_CONTENT_SOURCE_ID }, []).filter((spell) => spell.rulesSourceId === SRD_CONTENT_SOURCE_ID);
}

export function catalogSpell(definitionId: string) {
  return catalogSpells.find((spell) => spell.id === definitionId);
}

export function findCatalogSpellByName(name: string) {
  const normalized = normalizeSpellName(name);
  return catalogSpells.find((spell) => normalizeSpellName(spell.name) === normalized || normalizeSpellName(primarySpellName(spell.name)) === normalized);
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

export function suggestCatalogSpells(name: string, enabledSourceIds = defaultEnabledContentSourceIds) {
  const normalized = normalizeSpellName(name);
  if (normalized.length < 3) return [];
  return searchCatalogSpells({}, enabledSourceIds).filter((spell) => {
    const candidate = normalizeSpellName(primarySpellName(spell.name));
    return candidate.includes(normalized)
      || normalized.includes(candidate)
      || editDistance(normalized, candidate) <= Math.max(1, Math.floor(candidate.length / 6));
  }).sort((a, b) => editDistance(normalized, normalizeSpellName(primarySpellName(a.name))) - editDistance(normalized, normalizeSpellName(primarySpellName(b.name))) || a.name.localeCompare(b.name));
}

export function suggestSrdSpells(name: string) {
  return suggestCatalogSpells(name, []).filter((spell) => spell.rulesSourceId === SRD_CONTENT_SOURCE_ID);
}

function choiceValue(association: CatalogSpellAssociation) {
  return [association.contentSourceId, association.sourceClass].join("|");
}

export function characterSourceClassChoices(characterClass: string, spell: CatalogSpellDefinition, enabledSourceIds = defaultEnabledContentSourceIds): CatalogSourceChoice[] {
  const normalizedCharacter = characterClass.toLocaleLowerCase();
  const choices = enabledAssociations(spell, enabledSourceIds).map((association) => ({
    ...association,
    value: choiceValue(association),
    label: association.contentSourceId === FFXIV_CONTENT_SOURCE_ID ? `${association.sourceClass} · FFXIV` : association.sourceClass,
  }));
  const unique = [...new Map(choices.map((choice) => [choice.value, choice])).values()];
  const matches = unique.filter((choice) => [choice.sourceClass, choice.className, choice.subclassName].some((value) => value && normalizedCharacter.includes(value.toLocaleLowerCase())));
  return matches.length ? matches : unique;
}

export function catalogSourceChoice(spell: CatalogSpellDefinition, value: string, enabledSourceIds = defaultEnabledContentSourceIds) {
  return characterSourceClassChoices("", spell, enabledSourceIds).find((choice) => choice.value === value);
}

export function spellcastingAbilityForClass(className: string): AbilityId | null {
  const normalized = className.trim().toLocaleLowerCase();
  if (!normalized) return null;
  const ffxivAbility = Object.entries(ffxivPack.classAbilities).find(([name]) => name.toLocaleLowerCase() === normalized)?.[1];
  return ffxivAbility
    ?? srdClasses.find((entry) => entry.name.toLocaleLowerCase() === normalized)?.spellcastingAbility
    ?? null;
}

export const spellCatalogMetadata = {
  totalCount: catalogSpells.length,
  srdCount: srdSpells.length,
  ffxivCompleteCount: ffxivPack.review.completeCustomDefinitions,
  ffxivIncompleteCount: ffxivPack.review.incompleteNamedOnlyEntries,
  schools: uniqueValues(catalogSpells.filter((spell) => spell.definitionStatus === "complete").map((spell) => spell.school)).sort(),
};
