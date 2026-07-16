import type { Character, Spell } from "../../domain/models";
import { FFXIV_CONTENT_SOURCE_ID, SRD_CONTENT_SOURCE_ID } from "../../rules/contentSources";
import type { CatalogSourceChoice, CatalogSpellDefinition } from "../../rules/spellCatalog";

export type SpellbookPageId = "desk" | "classes" | "chapter" | "search" | "owned" | "resources";

export type SpellbookPosition = {
  page: SpellbookPageId;
  classKey: string;
  level: number;
};

export type ClassChapter = {
  key: string;
  name: string;
  contentSourceId: string;
  rulesSourceIds: string[];
  spellCount: number;
  levels: number[];
  incompleteCount: number;
};

export type CatalogEligibility = {
  canAdd: boolean;
  reason: string;
  validChoices: CatalogSourceChoice[];
  requiredLevel: number | null;
};

export const defaultSpellbookPosition: SpellbookPosition = {
  page: "desk",
  classKey: "",
  level: 0,
};

const spellcastingProgressions = {
  Bard: { kind: "full", cantrips: true },
  Cleric: { kind: "full", cantrips: true },
  Druid: { kind: "full", cantrips: true },
  Sorcerer: { kind: "full", cantrips: true },
  Wizard: { kind: "full", cantrips: true },
  Paladin: { kind: "half", cantrips: false },
  Ranger: { kind: "half", cantrips: false },
  Warlock: { kind: "pact", cantrips: true },
} as const;

function normalized(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function enabledAssociation(contentSourceId: string, enabledSourceIds: string[]) {
  return contentSourceId === SRD_CONTENT_SOURCE_ID || enabledSourceIds.includes(contentSourceId);
}

function choiceValue(association: CatalogSpellDefinition["associations"][number]) {
  return {
    ...association,
    value: [association.contentSourceId, association.sourceClass].join("|"),
    label: association.contentSourceId === FFXIV_CONTENT_SOURCE_ID ? `${association.sourceClass} · FFXIV` : association.sourceClass,
  } satisfies CatalogSourceChoice;
}

function characterMatchesAssociation(characterClass: string, choice: CatalogSourceChoice) {
  const characterName = normalized(characterClass);
  if (!characterName) return false;
  return [choice.sourceClass, choice.className, choice.subclassName]
    .map(normalized)
    .filter(Boolean)
    .some((className) => characterName === className || characterName.includes(className));
}

function progressionFor(choice: CatalogSourceChoice) {
  if (choice.contentSourceId !== SRD_CONTENT_SOURCE_ID) return undefined;
  return spellcastingProgressions[choice.className as keyof typeof spellcastingProgressions]
    ?? spellcastingProgressions[choice.sourceClass as keyof typeof spellcastingProgressions];
}

export function requiredClassLevelForSpell(choice: CatalogSourceChoice, spellLevel: number) {
  const progression = progressionFor(choice);
  if (!progression) return null;
  if (spellLevel === 0) return progression.cantrips ? 1 : null;
  if (progression.kind === "full") return Math.min(17, spellLevel * 2 - 1);
  if (progression.kind === "pact") return Math.min(17, spellLevel * 2 - 1);
  if (spellLevel > 5) return null;
  return spellLevel === 1 ? 2 : spellLevel * 4 - 3;
}

export function catalogEligibility(
  character: Pick<Character, "characterClass" | "level">,
  definition: CatalogSpellDefinition,
  enabledSourceIds: string[],
  owned = false,
): CatalogEligibility {
  if (owned) return { canAdd: false, reason: "Already owned", validChoices: [], requiredLevel: null };
  if (definition.level === null) return { canAdd: false, reason: "Spell level is unavailable", validChoices: [], requiredLevel: null };

  const enabledChoices = definition.associations
    .filter((association) => enabledAssociation(association.contentSourceId, enabledSourceIds))
    .map(choiceValue);
  const characterChoices = enabledChoices.filter((choice) => characterMatchesAssociation(character.characterClass, choice));

  if (!characterChoices.length) {
    return { canAdd: false, reason: "Not available to this character’s class", validChoices: [], requiredLevel: null };
  }

  if (/\s(?:and|&)\s|[/,+]/i.test(character.characterClass)) {
    return {
      canAdd: false,
      reason: "Individual class levels are not configured for this multiclass character",
      validChoices: [],
      requiredLevel: null,
    };
  }

  const choicesWithRequirements = characterChoices.map((choice) => ({
    choice,
    requiredLevel: requiredClassLevelForSpell(choice, definition.level as number),
  }));
  const missingProgression = choicesWithRequirements.filter(({ requiredLevel }) => requiredLevel === null);
  const eligible = choicesWithRequirements.filter(({ requiredLevel }) => requiredLevel !== null && character.level >= requiredLevel);

  if (eligible.length) {
    return {
      canAdd: definition.definitionStatus === "complete",
      reason: definition.definitionStatus === "complete"
        ? eligible.length === 1 ? "Ready to add" : "Select a source class"
        : "Rules definition must be completed",
      validChoices: eligible.map(({ choice }) => choice),
      requiredLevel: Math.min(...eligible.map(({ requiredLevel }) => requiredLevel as number)),
    };
  }

  if (missingProgression.length === characterChoices.length) {
    return {
      canAdd: false,
      reason: `Spell progression is not configured for ${characterChoices.map((choice) => choice.sourceClass).join(" or ")}`,
      validChoices: [],
      requiredLevel: null,
    };
  }

  const next = choicesWithRequirements
    .filter(({ requiredLevel }) => requiredLevel !== null)
    .sort((left, right) => (left.requiredLevel as number) - (right.requiredLevel as number))[0];
  return {
    canAdd: false,
    reason: `Requires ${next.choice.sourceClass} level ${next.requiredLevel}`,
    validChoices: [],
    requiredLevel: next.requiredLevel,
  };
}

export function buildClassChapters(definitions: CatalogSpellDefinition[], enabledSourceIds: string[]): ClassChapter[] {
  const chapters = new Map<string, {
    name: string;
    contentSourceId: string;
    rulesSourceIds: Set<string>;
    spellIds: Set<string>;
    levels: Set<number>;
    incompleteIds: Set<string>;
  }>();

  for (const definition of definitions) {
    for (const association of definition.associations.filter((entry) => enabledAssociation(entry.contentSourceId, enabledSourceIds))) {
      const key = `${association.contentSourceId}::${association.sourceClass}`;
      const chapter = chapters.get(key) ?? {
        name: association.sourceClass,
        contentSourceId: association.contentSourceId,
        rulesSourceIds: new Set<string>(),
        spellIds: new Set<string>(),
        levels: new Set<number>(),
        incompleteIds: new Set<string>(),
      };
      chapter.rulesSourceIds.add(definition.rulesSourceId);
      chapter.spellIds.add(definition.id);
      if (definition.level !== null) chapter.levels.add(definition.level);
      if (definition.definitionStatus === "unavailable") chapter.incompleteIds.add(definition.id);
      chapters.set(key, chapter);
    }
  }

  return [...chapters.entries()].map(([key, chapter]) => ({
    key,
    name: chapter.name,
    contentSourceId: chapter.contentSourceId,
    rulesSourceIds: [...chapter.rulesSourceIds],
    spellCount: chapter.spellIds.size,
    levels: [...chapter.levels].sort((left, right) => left - right),
    incompleteCount: chapter.incompleteIds.size,
  })).sort((left, right) => left.name.localeCompare(right.name) || left.contentSourceId.localeCompare(right.contentSourceId));
}

export function spellsForClassChapter(definitions: CatalogSpellDefinition[], chapterKey: string, level: number) {
  const [contentSourceId, sourceClass] = chapterKey.split("::");
  return definitions.filter((definition) => definition.level === level && definition.associations.some((association) => (
    association.contentSourceId === contentSourceId && association.sourceClass === sourceClass
  ))).sort((left, right) => left.name.localeCompare(right.name));
}

export function groupOwnedSpellsByLevel(spells: Spell[]) {
  return Array.from({ length: 10 }, (_, level) => ({
    level,
    spells: spells.filter((spell) => spell.level === level).sort((left, right) => left.name.localeCompare(right.name)),
  })).filter((group) => group.spells.length > 0);
}

export function parseSpellbookPosition(value: string | null): SpellbookPosition {
  if (!value) return defaultSpellbookPosition;
  try {
    const parsed = JSON.parse(value) as Partial<SpellbookPosition>;
    const page = ["desk", "classes", "chapter", "search", "owned", "resources"].includes(parsed.page ?? "")
      ? parsed.page as SpellbookPageId
      : "desk";
    const level = Number.isInteger(parsed.level) && (parsed.level as number) >= 0 && (parsed.level as number) <= 9 ? parsed.level as number : 0;
    return { page, classKey: typeof parsed.classKey === "string" ? parsed.classKey : "", level };
  } catch {
    return defaultSpellbookPosition;
  }
}
