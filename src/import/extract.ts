import type { AbilityId, SkillId } from "../domain/models";
import type { CharacterImportDraft, ImportField } from "../domain/import";
import { abilityIds, skillIds } from "../storage/characterSheets";

const skillLabels: Record<SkillId, string> = {
  acrobatics: "Acrobatics", animalHandling: "Animal Handling", arcana: "Arcana",
  athletics: "Athletics", deception: "Deception", history: "History", insight: "Insight",
  intimidation: "Intimidation", investigation: "Investigation", medicine: "Medicine",
  nature: "Nature", perception: "Perception", performance: "Performance", persuasion: "Persuasion",
  religion: "Religion", sleightOfHand: "Sleight of Hand", stealth: "Stealth", survival: "Survival",
};

function field<T>(value: T, needsReview = false, include = true, sourceName = "", confidence: number | null = null): ImportField<T> {
  return { value, needsReview, include, confidence, sourceNames: sourceName ? [sourceName] : [], conflicts: [] };
}

function matchText(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[:\\-]?\\s*([^\\n|]{1,100})`, "im"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function matchNumber(text: string, labels: string[], fallback: number, sourceName: string) {
  const value = matchText(text, labels).match(/-?\d+/)?.[0];
  return value == null ? field(fallback, true, false) : field(Number(value), false, true, sourceName, 0.78);
}

function extractSection(text: string, labels: string[], limit = 20) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => labels.some((label) => line.toLowerCase().includes(label)));
  if (start < 0) return [];
  const sectionHeading = /^(features(?:\s*&\s*traits)?|traits|spells|notes|additional features|equipment|inventory|treasure|biography|backstory|personality traits|ideals|bonds|flaws)(?:\s*:.*)?$/i;
  const values: string[] = [];
  const inlineValue = lines[start].match(/^[^:]+:\s*(.+)$/)?.[1]?.trim();
  if (inlineValue) values.push(inlineValue);
  for (const line of lines.slice(start + 1, start + 1 + limit)) {
    if (sectionHeading.test(line)) break;
    values.push(line);
  }
  return values;
}

export function extractCharacterText(rawText: string, sourceName: string): CharacterImportDraft {
  const text = rawText.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ");
  const nameValue = matchText(text, ["character name", "name"]);
  const classAndLevelValue = matchText(text, ["class & level", "class and level", "class level", "class"]);
  const classValue = classAndLevelValue.replace(/(?:\s+|\/)(?:level\s*)?\d{1,2}\s*$/i, "").trim();
  const ancestryValue = matchText(text, ["race", "species", "ancestry"]);
  const playerValue = matchText(text, ["player name", "player"]);
  const backgroundValue = matchText(text, ["background"]);
  const biographyValue = matchText(text, ["biography", "backstory"]);

  const abilityScores = Object.fromEntries(abilityIds.map((ability) => {
    const label = ability === "str" ? "strength" : ability === "dex" ? "dexterity" : ability === "con" ? "constitution" : ability === "int" ? "intelligence" : ability === "wis" ? "wisdom" : "charisma";
    const match = text.match(new RegExp(`(?:${label}|${ability})\\s*[:\\-]?\\s*(\\d{1,2})`, "i"));
    return [ability, match ? field(Number(match[1]), false, true, sourceName, 0.82) : field(10, true, false)];
  })) as Record<AbilityId, ImportField<number>>;

  const skills = Object.fromEntries(skillIds.map((skill) => {
    const found = new RegExp(`(?:proficient|proficiency|[●•✓x])?\\s*${skillLabels[skill]}`, "i").test(text);
    return [skill, field(found, !found, found, found ? sourceName : "", found ? 0.65 : null)];
  })) as Record<SkillId, ImportField<boolean>>;

  const savingThrows = Object.fromEntries(abilityIds.map((ability) => {
    const found = new RegExp(`${ability}\\s+sav(?:e|ing)`, "i").test(text);
    return [ability, field(found, !found, found, found ? sourceName : "", found ? 0.65 : null)];
  })) as Record<AbilityId, ImportField<boolean>>;

  const inventory = extractSection(text, ["inventory", "equipment", "treasure"]);
  const features = extractSection(text, ["features", "traits", "features & traits"]);
  const formTextBlock = text.split(/\n\s*\n/)[0] || text;
  const noteLines = extractSection(formTextBlock, ["spells", "notes", "additional features"], 1000);
  const notes = (noteLines.length ? noteLines : extractSection(text, ["spells", "notes", "additional features"], 1000)).join("\n");
  const levelMatch = classAndLevelValue.match(/\b(\d{1,2})\b/) ?? text.match(/(?:level|class\s*&\s*level)[^\d]{0,20}(\d{1,2})/i);

  return {
    sourceName,
    rawText: text,
    name: field(nameValue || sourceName.replace(/\.[^.]+$/, ""), !nameValue, true, sourceName, nameValue ? 0.82 : 0.35),
    playerName: field(playerValue, !playerValue, Boolean(playerValue), playerValue ? sourceName : "", playerValue ? 0.82 : null),
    level: field(levelMatch ? Math.min(20, Math.max(1, Number(levelMatch[1]))) : 1, !levelMatch, Boolean(levelMatch), levelMatch ? sourceName : "", levelMatch ? 0.82 : null),
    characterClass: field(classValue, !classValue, Boolean(classValue), classValue ? sourceName : "", classValue ? 0.78 : null),
    ancestry: field(ancestryValue, !ancestryValue, Boolean(ancestryValue), ancestryValue ? sourceName : "", ancestryValue ? 0.82 : null),
    background: field(backgroundValue, !backgroundValue, Boolean(backgroundValue), backgroundValue ? sourceName : "", backgroundValue ? 0.82 : null),
    biography: field(biographyValue, !biographyValue, Boolean(biographyValue), biographyValue ? sourceName : "", biographyValue ? 0.78 : null),
    abilityScores,
    currentHp: matchNumber(text, ["current hp", "current hit points", "hit points current"], 0, sourceName),
    maxHp: matchNumber(text, ["max hp", "hit point maximum", "maximum hp"], 0, sourceName),
    armorClass: matchNumber(text, ["armor class", "ac"], 10, sourceName),
    initiative: matchNumber(text, ["initiative"], 0, sourceName),
    speed: matchNumber(text, ["speed"], 30, sourceName),
    proficiencyBonus: matchNumber(text, ["proficiency bonus", "proficiency modifier", "prof bonus"], 2, sourceName),
    skills,
    savingThrows,
    inventory: field(inventory, inventory.length === 0, inventory.length > 0, inventory.length ? sourceName : "", inventory.length ? 0.65 : null),
    features: field(features, features.length === 0, features.length > 0, features.length ? sourceName : "", features.length ? 0.65 : null),
    spellsAndNotes: field(notes, !notes, Boolean(notes), notes ? sourceName : "", notes ? 0.65 : null),
  };
}

export function applyProviderConfidence(draft: CharacterImportDraft, confidence: number | null) {
  if (confidence == null) return draft;
  const apply = <T>(value: ImportField<T>): ImportField<T> => value.include
    ? { ...value, confidence: value.confidence == null ? confidence : Math.min(value.confidence, confidence) }
    : value;
  return {
    ...draft,
    name: apply(draft.name),
    playerName: apply(draft.playerName),
    level: apply(draft.level),
    characterClass: apply(draft.characterClass),
    ancestry: apply(draft.ancestry),
    background: apply(draft.background),
    biography: apply(draft.biography),
    abilityScores: Object.fromEntries(Object.entries(draft.abilityScores).map(([key, value]) => [key, apply(value)])) as CharacterImportDraft["abilityScores"],
    currentHp: apply(draft.currentHp),
    maxHp: apply(draft.maxHp),
    armorClass: apply(draft.armorClass),
    initiative: apply(draft.initiative),
    speed: apply(draft.speed),
    proficiencyBonus: apply(draft.proficiencyBonus),
    skills: Object.fromEntries(Object.entries(draft.skills).map(([key, value]) => [key, apply(value)])) as CharacterImportDraft["skills"],
    savingThrows: Object.fromEntries(Object.entries(draft.savingThrows).map(([key, value]) => [key, apply(value)])) as CharacterImportDraft["savingThrows"],
    inventory: apply(draft.inventory),
    features: apply(draft.features),
    spellsAndNotes: apply(draft.spellsAndNotes),
  };
}
