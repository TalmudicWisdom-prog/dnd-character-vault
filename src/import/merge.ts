import type { AbilityId, SkillId } from "../domain/models";
import type { CharacterImportDraft, ImportConflict, ImportField, ImportParseResult } from "../domain/import";
import { abilityIds, skillIds } from "../storage/characterSheets";
import { deduplicateImportedSpells } from "./pdfSpells";

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeField<T>(results: ImportParseResult[], select: (draft: CharacterImportDraft) => ImportField<T>, path: string, label: string) {
  const candidates = results
    .map((result) => ({ sourceName: result.sourceName, field: select(result.draft) }))
    .filter(({ field }) => field.include);
  if (!candidates.length) return { field: select(results[0].draft), conflict: null };

  const first = candidates[0];
  const differing = candidates.filter(({ field }) => !sameValue(field.value, first.field.value));
  const sourceNames = [...new Set(candidates.flatMap(({ field, sourceName }) => field.sourceNames.length ? field.sourceNames : [sourceName]))];
  const confidenceValues = candidates.map(({ field }) => field.confidence).filter((value): value is number => value != null);
  const conflicts = differing.map(({ sourceName, field }) => ({ sourceName, value: field.value }));
  const field: ImportField<T> = {
    ...first.field,
    needsReview: first.field.needsReview || differing.length > 0,
    confidence: confidenceValues.length ? Math.min(...confidenceValues) : null,
    sourceNames,
    conflicts,
  };
  const conflict: ImportConflict | null = differing.length ? {
    fieldPath: path,
    label,
    sources: candidates.map(({ sourceName, field: candidate }) => ({ sourceName, value: Array.isArray(candidate.value) ? candidate.value.join("\n") : String(candidate.value) })),
  } : null;
  return { field, conflict };
}

function mergeLists(results: ImportParseResult[], select: (draft: CharacterImportDraft) => ImportField<string[]>) {
  const candidates = results.map((result) => ({ sourceName: result.sourceName, field: select(result.draft) })).filter(({ field }) => field.include);
  const values = [...new Set(candidates.flatMap(({ field }) => field.value).map((value) => value.trim()).filter(Boolean))];
  return {
    value: values,
    include: values.length > 0,
    needsReview: candidates.some(({ field }) => field.needsReview),
    confidence: candidates.some(({ field }) => field.confidence != null) ? Math.min(...candidates.map(({ field }) => field.confidence ?? 1)) : null,
    sourceNames: [...new Set(candidates.flatMap(({ field, sourceName }) => field.sourceNames.length ? field.sourceNames : [sourceName]))],
    conflicts: [],
  };
}

function mergeText(results: ImportParseResult[], select: (draft: CharacterImportDraft) => ImportField<string>) {
  const candidates = results.map((result) => ({ sourceName: result.sourceName, field: select(result.draft) })).filter(({ field }) => field.include && field.value.trim());
  const values = [...new Set(candidates.map(({ field }) => field.value.trim()))];
  return {
    value: values.join("\n\n"),
    include: values.length > 0,
    needsReview: candidates.some(({ field }) => field.needsReview),
    confidence: candidates.some(({ field }) => field.confidence != null) ? Math.min(...candidates.map(({ field }) => field.confidence ?? 1)) : null,
    sourceNames: [...new Set(candidates.flatMap(({ field, sourceName }) => field.sourceNames.length ? field.sourceNames : [sourceName]))],
    conflicts: [],
  };
}

export function mergeImportResults(results: ImportParseResult[]) {
  if (!results.length) throw new Error("No parsed files to merge");
  const conflicts: ImportConflict[] = [];
  const take = <T>(select: (draft: CharacterImportDraft) => ImportField<T>, path: string, label: string) => {
    const merged = mergeField(results, select, path, label);
    if (merged.conflict) conflicts.push(merged.conflict);
    return merged.field;
  };
  const abilityScores = Object.fromEntries(abilityIds.map((ability) =>
    [ability, take((draft) => draft.abilityScores[ability], `abilityScores.${ability}`, ability.toUpperCase())],
  )) as Record<AbilityId, ImportField<number>>;
  const skills = Object.fromEntries(skillIds.map((skill) =>
    [skill, take((draft) => draft.skills[skill], `skills.${skill}`, skill)],
  )) as Record<SkillId, ImportField<boolean>>;
  const savingThrows = Object.fromEntries(abilityIds.map((ability) =>
    [ability, take((draft) => draft.savingThrows[ability], `savingThrows.${ability}`, `${ability.toUpperCase()} save`)],
  )) as Record<AbilityId, ImportField<boolean>>;
  const importedSpellCandidates = results.filter((result) => result.draft.importedSpells?.include).flatMap((result) => result.draft.importedSpells?.value ?? []);
  const importedSpells = deduplicateImportedSpells(importedSpellCandidates);
  const importedSpellSources = [...new Set(results.filter((result) => result.draft.importedSpells?.include).map((result) => result.sourceName))];
  const emptyAbility: ImportField<CharacterImportDraft["spellcastingAbility"]["value"]> = { value: null, include: false, needsReview: true, confidence: null, sourceNames: [], conflicts: [] };
  const emptyNumber: ImportField<number> = { value: 0, include: false, needsReview: true, confidence: null, sourceNames: [], conflicts: [] };
  const emptyText: ImportField<string> = { value: "", include: false, needsReview: true, confidence: null, sourceNames: [], conflicts: [] };

  const mergedDraft: CharacterImportDraft = {
    sourceName: results.map((result) => result.sourceName).join(", "),
    rawText: results.map((result) => `--- ${result.sourceName} ---\n${result.rawText}`).join("\n\n"),
    name: take((draft) => draft.name, "name", "Character name"),
    playerName: take((draft) => draft.playerName, "playerName", "Player name"),
    level: take((draft) => draft.level, "level", "Level"),
    characterClass: take((draft) => draft.characterClass, "characterClass", "Class / classes"),
    ancestry: take((draft) => draft.ancestry, "ancestry", "Species / ancestry"),
    background: take((draft) => draft.background, "background", "Background"),
    biography: take((draft) => draft.biography, "biography", "Biography"),
    abilityScores,
    currentHp: take((draft) => draft.currentHp, "currentHp", "Current HP"),
    maxHp: take((draft) => draft.maxHp, "maxHp", "Max HP"),
    armorClass: take((draft) => draft.armorClass, "armorClass", "Armor Class"),
    initiative: take((draft) => draft.initiative, "initiative", "Initiative"),
    speed: take((draft) => draft.speed, "speed", "Speed"),
    proficiencyBonus: take((draft) => draft.proficiencyBonus, "proficiencyBonus", "Proficiency Bonus"),
    skills,
    savingThrows,
    inventory: mergeLists(results, (draft) => draft.inventory),
    features: mergeLists(results, (draft) => draft.features),
    spellsAndNotes: mergeText(results, (draft) => draft.spellsAndNotes),
    rawSpellCount: results.reduce((total, result) => total + (result.draft.rawSpellCount ?? 0), 0),
    importedSpells: {
      value: importedSpells,
      include: importedSpells.length > 0,
      needsReview: importedSpells.some((spell) => spell.level === null),
      confidence: importedSpells.length ? 0.98 : null,
      sourceNames: importedSpellSources,
      conflicts: [],
    },
    spellcastingAbility: take((draft) => draft.spellcastingAbility ?? emptyAbility, "spellcastingAbility", "Spellcasting ability"),
    spellSaveDc: take((draft) => draft.spellSaveDc ?? emptyNumber, "spellSaveDc", "Spell save DC"),
    spellAttackBonus: take((draft) => draft.spellAttackBonus ?? emptyNumber, "spellAttackBonus", "Spell attack bonus"),
    spellcastingClass: take((draft) => draft.spellcastingClass ?? emptyText, "spellcastingClass", "Spellcasting class"),
  };
  return { mergedDraft, conflicts };
}
