import type { AbilityId, CharacterCreationDraft } from "../../domain/models";
import { abilityModifier } from "../../domain/dndMath";
import type { SrdClass, SrdNamedOption, SrdSpell } from "../../rules/srd";
import { srdEquipmentItem, srdSpells } from "../../rules/srd";
import { suggestedMaxHp } from "./creationMode";

export type CombatSuggestion = {
  armorClass: number;
  initiative: number;
  speed: number;
  maxHp: number;
  currentHp: number;
  hitDice: string;
  hitDie: string;
  constitutionModifier: number;
  dexterityModifier: number;
};

export type GuidedFeatureSuggestions = {
  classFeatures: string[];
  speciesTraits: string[];
  backgroundFeature: string[];
  feats: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  languages: string[];
  specialAbilities: string[];
};

export const guidedFeatureEmptyStateText = "No SRD data found yet. You can add this manually, skip for now, or edit it later.";

export function combatSuggestions(draft: CharacterCreationDraft, selectedClass?: SrdClass, selectedSpecies?: SrdNamedOption): CombatSuggestion | null {
  if (!selectedClass) return null;
  const level = draft.character.level || 1;
  const dexterityModifier = abilityModifier(draft.sheet.abilityScores.dex ?? 10);
  const constitutionModifier = abilityModifier(draft.sheet.abilityScores.con ?? 10);
  const maxHp = suggestedMaxHp(level, selectedClass.hitDie, draft.sheet.abilityScores.con ?? 10);
  return {
    armorClass: Math.max(0, 10 + dexterityModifier),
    initiative: dexterityModifier,
    speed: selectedSpecies?.speed ?? 30,
    maxHp,
    currentHp: maxHp,
    hitDice: `${level}d${selectedClass.hitDie}`,
    hitDie: `d${selectedClass.hitDie}`,
    constitutionModifier,
    dexterityModifier,
  };
}

export function selectedEquipmentNames(draft: CharacterCreationDraft) {
  return draft.equipment.filter((item) => item.source === "SRD").map((item) => item.name);
}

export function equipmentName(id: string) {
  return srdEquipmentItem(id)?.name ?? id;
}

export function spellcastingCantripLimit(selectedClass?: SrdClass, level = 1) {
  if (!selectedClass?.spellcastingAbility) return 0;
  const levels = Object.keys(selectedClass.cantripsKnownByLevel ?? {})
    .map(Number)
    .filter((knownLevel) => knownLevel <= level)
    .sort((a, b) => b - a);
  return selectedClass.cantripsKnownByLevel?.[levels[0]] ?? 0;
}

export function preparedSpellLimit(draft: CharacterCreationDraft, selectedClass?: SrdClass) {
  if (!selectedClass?.spellcastingAbility) return 0;
  if (selectedClass.spellcastingKind === "known" || selectedClass.spellcastingKind === "pact") return 4;
  const score = draft.sheet.abilityScores[selectedClass.spellcastingAbility as AbilityId] ?? 10;
  return Math.max(1, draft.character.level + abilityModifier(score));
}

export function spellsForClass(className: string) {
  return srdSpells.filter((spell) => spell.classes.includes(className));
}

export function filterSrdSpells(spells: SrdSpell[], options: { search: string; level: string; className: string; school: string }) {
  const search = options.search.trim().toLocaleLowerCase();
  return spells
    .filter((spell) => !search || spell.name.toLocaleLowerCase().includes(search) || spell.description.toLocaleLowerCase().includes(search))
    .filter((spell) => options.level === "all" || spell.level === Number(options.level))
    .filter((spell) => options.className === "all" || spell.classes.includes(options.className))
    .filter((spell) => options.school === "all" || spell.school === options.school)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function canSelectSrdSpell(draft: CharacterCreationDraft, spell: SrdSpell, selectedClass?: SrdClass) {
  if (spell.level === 0) {
    return draft.srdSelectedCantripIds.includes(spell.id)
      || draft.srdSelectedCantripIds.length < spellcastingCantripLimit(selectedClass, draft.character.level);
  }
  return draft.srdSelectedSpellIds.includes(spell.id)
    || draft.srdSelectedSpellIds.length < preparedSpellLimit(draft, selectedClass);
}

export function guidedFeatureSuggestions(selectedClass?: SrdClass, selectedSpecies?: SrdNamedOption, selectedBackground?: SrdNamedOption): GuidedFeatureSuggestions {
  return {
    classFeatures: selectedClass?.features ?? [],
    speciesTraits: selectedSpecies?.traits ?? [],
    backgroundFeature: selectedBackground?.backgroundFeature ? [selectedBackground.backgroundFeature] : [],
    feats: selectedBackground?.feat ? [selectedBackground.feat] : [],
    armorProficiencies: [
      ...(selectedClass?.armorProficiencies ?? []),
      ...(selectedSpecies?.armorProficiencies ?? []),
      ...(selectedBackground?.armorProficiencies ?? []),
    ],
    weaponProficiencies: [
      ...(selectedClass?.weaponProficiencies ?? []),
      ...(selectedSpecies?.weaponProficiencies ?? []),
      ...(selectedBackground?.weaponProficiencies ?? []),
    ],
    toolProficiencies: [
      ...(selectedClass?.toolProficiencies ?? []),
      ...(selectedSpecies?.tools ?? []),
      ...(selectedSpecies?.toolProficiencies ?? []),
      ...(selectedBackground?.tools ?? []),
      ...(selectedBackground?.toolProficiencies ?? []),
    ],
    languages: [
      ...(selectedClass?.languages ?? []),
      ...(selectedSpecies?.languages ?? []),
      ...(selectedBackground?.languages ?? []),
    ],
    specialAbilities: [
      ...(selectedClass?.specialAbilities ?? []),
      ...(selectedSpecies?.specialAbilities ?? []),
      ...(selectedBackground?.specialAbilities ?? []),
    ],
  };
}

export function mergeUniqueLines(existing: string, additions: string[]) {
  const current = existing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const seen = new Set(current.map((line) => line.toLocaleLowerCase()));
  const next = [...current];
  for (const addition of additions.map((line) => line.trim()).filter(Boolean)) {
    const key = addition.toLocaleLowerCase();
    if (!seen.has(key)) {
      next.push(addition);
      seen.add(key);
    }
  }
  return next.join("\n");
}

export function applyGuidedFeatureSuggestions(draft: CharacterCreationDraft, selectedClass?: SrdClass, selectedSpecies?: SrdNamedOption, selectedBackground?: SrdNamedOption) {
  const suggestions = guidedFeatureSuggestions(selectedClass, selectedSpecies, selectedBackground);
  return {
    ...draft,
    sheet: {
      ...draft.sheet,
      classFeatures: mergeUniqueLines(draft.sheet.classFeatures, suggestions.classFeatures),
      speciesTraits: mergeUniqueLines(draft.sheet.speciesTraits, suggestions.speciesTraits),
      backgroundFeature: mergeUniqueLines(draft.sheet.backgroundFeature, suggestions.backgroundFeature),
      feats: mergeUniqueLines(draft.sheet.feats, suggestions.feats),
      armorProficiencies: mergeUniqueLines(draft.sheet.armorProficiencies, suggestions.armorProficiencies),
      weaponProficiencies: mergeUniqueLines(draft.sheet.weaponProficiencies, suggestions.weaponProficiencies),
      toolProficiencies: mergeUniqueLines(draft.sheet.toolProficiencies, suggestions.toolProficiencies),
      languages: mergeUniqueLines(draft.sheet.languages, suggestions.languages),
      specialAbilities: mergeUniqueLines(draft.sheet.specialAbilities, suggestions.specialAbilities),
    },
  };
}
