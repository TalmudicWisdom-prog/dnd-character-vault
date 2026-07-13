import type { Spell, Spellbook } from "../domain/models";
import { spellSchema, spellbookSchema } from "../domain/models";
import type { SrdSpell } from "../rules/srd";
import {
  actionTypeFromCastingTime,
  catalogSourceChoice,
  catalogSpell,
  type CatalogSourceChoice,
  type CatalogSpellDefinition,
  SRD_SPELL_CATALOG_VERSION,
} from "../rules/spellCatalog";
import { FFXIV_CONTENT_SOURCE_ID, SRD_CONTENT_SOURCE_ID, contentSource } from "../rules/contentSources";
import { db } from "./database";

function now() {
  return new Date().toISOString();
}

export async function getOrCreateSpellbook(characterId: string): Promise<Spellbook> {
  const existing = await db.spellbooks.get(characterId);
  if (existing) return spellbookSchema.parse(existing);
  const spellbook = spellbookSchema.parse({ characterId, pinnedSpellIds: [], updatedAt: now() });
  await db.spellbooks.add(spellbook);
  return spellbook;
}

export function createEmptySpell(characterId: string, name: string): Spell {
  const timestamp = now();
  return spellSchema.parse({
    id: crypto.randomUUID(),
    characterId,
    name: name.trim(),
    level: 0,
    school: "Custom",
    castingTime: "1 action",
    actionType: "action",
    range: "Self",
    verbalComponent: false,
    somaticComponent: false,
    materialComponent: false,
    materialDetails: "",
    duration: "Instantaneous",
    concentration: false,
    ritual: false,
    damageType: "",
    damageFormula: "",
    healingFormula: "",
    areaOfEffectType: "",
    areaOfEffectSize: "",
    savingThrowType: "",
    attackRollRequired: false,
    statusEffects: "",
    description: "",
    higherLevelScaling: "",
    sourceNotes: "",
    source: "Homebrew",
    homebrew: true,
    definitionId: "",
    definitionVersion: "",
    rulesSourceId: "",
    contentSourceId: "",
    sourcePage: null,
    sourceClass: "",
    sourceSubclass: "",
    castingAbilityOverride: null,
    rulesComplete: false,
    referenceDefinitionId: "",
    referenceClasses: [],
    referenceSourcePages: [],
    completionReviewed: false,
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createSpellFromSrd(characterId: string, spell: SrdSpell, sourceClass = ""): Spell {
  const definition = catalogSpell(spell.id);
  if (definition) {
    const sourceChoice = definition.associations.find((association) => association.sourceClass === sourceClass && association.contentSourceId === SRD_CONTENT_SOURCE_ID);
    return createSpellFromCatalogDefinition(characterId, definition, sourceChoice ? {
      ...sourceChoice,
      value: [sourceChoice.contentSourceId, sourceChoice.sourceClass].join("|"),
      label: sourceChoice.sourceClass,
    } : undefined);
  }
  const timestamp = now();
  return spellSchema.parse({
    id: crypto.randomUUID(),
    characterId,
    name: spell.name,
    level: spell.level,
    school: spell.school,
    castingTime: spell.castingTime,
    actionType: actionTypeFromCastingTime(spell.castingTime),
    range: spell.range,
    verbalComponent: spell.components.includes("V"),
    somaticComponent: spell.components.includes("S"),
    materialComponent: spell.components.includes("M"),
    materialDetails: spell.materialDetails,
    duration: spell.duration,
    concentration: spell.concentration,
    ritual: spell.ritual,
    damageType: spell.damageType ?? "",
    damageFormula: spell.damageFormula ?? "",
    healingFormula: spell.healingFormula ?? "",
    areaOfEffectType: spell.areaOfEffectType ?? "",
    areaOfEffectSize: spell.areaOfEffectSize ?? "",
    savingThrowType: spell.savingThrowType ?? "",
    attackRollRequired: spell.attackRollRequired ?? false,
    statusEffects: spell.statusEffects ?? "",
    description: spell.description,
    higherLevelScaling: spell.higherLevelScaling ?? "",
    sourceNotes: `SRD classes: ${spell.classes.join(", ")}`,
    source: "SRD",
    homebrew: false,
    definitionId: spell.id,
    definitionVersion: spell.sourceVersion ?? SRD_SPELL_CATALOG_VERSION,
    rulesSourceId: SRD_CONTENT_SOURCE_ID,
    contentSourceId: SRD_CONTENT_SOURCE_ID,
    sourcePage: null,
    sourceClass,
    sourceSubclass: "",
    castingAbilityOverride: null,
    rulesComplete: true,
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function sourceNotes(definition: CatalogSpellDefinition, choice?: CatalogSourceChoice) {
  const rulesSource = contentSource(definition.rulesSourceId)?.displayName ?? definition.rulesSourceId;
  const campaignSource = choice ? contentSource(choice.contentSourceId)?.displayName : undefined;
  return [
    `${definition.rulesSourceId === SRD_CONTENT_SOURCE_ID ? "Canonical rules" : "Rules source"}: ${rulesSource}`,
    campaignSource && choice ? `Available through: ${campaignSource} — ${choice.sourceClass}` : "",
    definition.sourcePage ? `Definition page: ${definition.sourcePage}` : "",
    choice?.page && choice.page !== definition.sourcePage ? `Class-list page: ${choice.page}` : "",
  ].filter(Boolean).join("\n");
}

export function createSpellFromCatalogDefinition(characterId: string, definition: CatalogSpellDefinition, choice?: CatalogSourceChoice): Spell {
  if (definition.definitionStatus !== "complete" || definition.level === null) throw new Error(`${definition.name} has no complete spell definition yet`);
  const timestamp = now();
  return spellSchema.parse({
    id: crypto.randomUUID(),
    characterId,
    name: definition.name,
    level: definition.level,
    school: definition.school,
    castingTime: definition.castingTime,
    actionType: actionTypeFromCastingTime(definition.castingTime),
    range: definition.range,
    verbalComponent: definition.components.includes("V"),
    somaticComponent: definition.components.includes("S"),
    materialComponent: definition.components.includes("M"),
    materialDetails: definition.materialDetails,
    duration: definition.duration,
    concentration: definition.concentration,
    ritual: definition.ritual,
    damageType: definition.damageType ?? "",
    damageFormula: definition.damageFormula ?? "",
    healingFormula: definition.healingFormula ?? "",
    areaOfEffectType: definition.areaOfEffectType ?? "",
    areaOfEffectSize: definition.areaOfEffectSize ?? "",
    savingThrowType: definition.savingThrowType ?? "",
    attackRollRequired: definition.attackRollRequired ?? false,
    statusEffects: definition.statusEffects ?? "",
    description: definition.description,
    higherLevelScaling: definition.higherLevelScaling ?? "",
    sourceNotes: sourceNotes(definition, choice),
    source: definition.rulesSourceId === SRD_CONTENT_SOURCE_ID ? "SRD" : "Homebrew",
    homebrew: definition.homebrew,
    definitionId: definition.id,
    definitionVersion: definition.sourceVersion,
    rulesSourceId: definition.rulesSourceId,
    contentSourceId: choice?.contentSourceId ?? definition.rulesSourceId,
    sourcePage: choice?.page ?? definition.sourcePage,
    sourceClass: choice?.sourceClass ?? "",
    sourceSubclass: choice?.subclassName ?? "",
    castingAbilityOverride: choice?.castingAbility ?? null,
    rulesComplete: true,
    referenceDefinitionId: "",
    referenceClasses: [],
    referenceSourcePages: [],
    completionReviewed: false,
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function uniqueReferencePages(definition: CatalogSpellDefinition) {
  return [...new Set([definition.sourcePage, ...definition.associations
    .filter((association) => association.contentSourceId === FFXIV_CONTENT_SOURCE_ID)
    .map((association) => association.page)]
    .filter((page): page is number => page !== null))].sort((left, right) => left - right);
}

function referenceNotes(definition: CatalogSpellDefinition, choice?: CatalogSourceChoice) {
  const pages = uniqueReferencePages(definition);
  const classes = [...new Set(definition.associations
    .filter((association) => association.contentSourceId === FFXIV_CONTENT_SOURCE_ID)
    .map((association) => association.sourceClass))];
  return [
    `FFXIV catalog reference: ${definition.id}`,
    `Source: ${contentSource(FFXIV_CONTENT_SOURCE_ID)?.displayName ?? FFXIV_CONTENT_SOURCE_ID}`,
    pages.length ? `Source pages: ${pages.join(", ")}` : "",
    classes.length ? `Available FFXIV classes: ${classes.join(", ")}` : "",
    choice ? `Chosen source class: ${choice.sourceClass}` : "",
  ].filter(Boolean).join("\n");
}

export function createReferenceSpellDraft(characterId: string, definition: CatalogSpellDefinition, choice?: CatalogSourceChoice): Spell {
  if (definition.definitionStatus !== "unavailable" || definition.level === null) throw new Error(`${definition.name} is not an incomplete catalog reference`);
  const timestamp = now();
  const referenceClasses = [...new Set(definition.associations
    .filter((association) => association.contentSourceId === FFXIV_CONTENT_SOURCE_ID)
    .map((association) => association.sourceClass))];
  return spellSchema.parse({
    ...createEmptySpell(characterId, definition.name),
    level: definition.level,
    school: "Unspecified",
    castingTime: "Unspecified",
    actionType: "special",
    range: "Unspecified",
    duration: "Unspecified",
    sourceNotes: referenceNotes(definition, choice),
    source: "Homebrew",
    homebrew: true,
    definitionId: `local:${definition.id}`,
    definitionVersion: definition.sourceVersion,
    rulesSourceId: definition.rulesSourceId,
    contentSourceId: choice?.contentSourceId ?? FFXIV_CONTENT_SOURCE_ID,
    sourcePage: choice?.page ?? definition.sourcePage,
    sourceClass: choice?.sourceClass ?? "",
    sourceSubclass: choice?.subclassName ?? "",
    castingAbilityOverride: choice?.castingAbility ?? null,
    rulesComplete: false,
    referenceDefinitionId: definition.id,
    referenceClasses,
    referenceSourcePages: uniqueReferencePages(definition),
    completionReviewed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function missingReferenceCompletionFields(spell: Spell) {
  if (!spell.referenceDefinitionId) return [];
  const missing: string[] = [];
  if (!spell.school.trim() || spell.school === "Custom" || spell.school === "Unspecified") missing.push("school");
  if (!spell.castingTime.trim() || spell.castingTime === "Unspecified") missing.push("casting time");
  if (!spell.range.trim() || spell.range === "Unspecified") missing.push("range");
  if (!spell.duration.trim() || spell.duration === "Unspecified") missing.push("duration");
  if (!spell.description.trim()) missing.push("description");
  if (!spell.completionReviewed) missing.push("review of action type, components, concentration, ritual, save/attack, and damage or healing fields");
  return missing;
}

export async function addReferenceSpell(characterId: string, definition: CatalogSpellDefinition, choice?: CatalogSourceChoice) {
  if (!choice?.sourceClass.trim()) throw new Error("Choose the spell's source class");
  await getOrCreateSpellbook(characterId);
  const existing = await db.spells.where("characterId").equals(characterId).toArray();
  if (existing.some((spell) => spell.referenceDefinitionId === definition.id || spell.definitionId === definition.id)) throw new Error(`${definition.name} is already owned by this character`);
  const reference = createReferenceSpellDraft(characterId, definition, choice);
  await db.spells.add(reference);
  await db.characters.update(characterId, { updatedAt: reference.updatedAt });
  return reference;
}

export async function saveAndAddReferenceSpell(spell: Spell) {
  if (!spell.referenceDefinitionId) throw new Error("This spell is not linked to an incomplete catalog reference");
  const missing = missingReferenceCompletionFields(spell);
  if (missing.length) throw new Error(`Complete: ${missing.join(", ")}`);
  await getOrCreateSpellbook(spell.characterId);
  const existing = await db.spells.where("characterId").equals(spell.characterId).toArray();
  const duplicate = existing.find((candidate) => candidate.id !== spell.id && candidate.referenceDefinitionId === spell.referenceDefinitionId);
  if (duplicate) throw new Error(`${spell.name} is already owned by this character`);
  const completed = spellSchema.parse({ ...spell, homebrew: true, rulesComplete: true, updatedAt: now() });
  if (existing.some((candidate) => candidate.id === spell.id)) await db.spells.put(completed);
  else await db.spells.add(completed);
  await db.characters.update(completed.characterId, { updatedAt: completed.updatedAt });
  return completed;
}

function asCatalogDefinition(definition: CatalogSpellDefinition | SrdSpell) {
  return "rulesSourceId" in definition ? definition : catalogSpell(definition.id);
}

export async function addSpellFromCatalog(characterId: string, input: CatalogSpellDefinition | SrdSpell, source: string | CatalogSourceChoice) {
  const definition = asCatalogDefinition(input);
  if (!definition) throw new Error("Catalog definition not found");
  const choice = typeof source === "string"
    ? catalogSourceChoice(definition, source) ?? definition.associations.map((association) => ({ ...association, value: "", label: association.sourceClass })).find((association) => association.sourceClass === source)
    : source;
  if (!choice?.sourceClass.trim()) throw new Error("Choose the spell's source class");
  if (definition.definitionStatus !== "complete") throw new Error(`${definition.name} is listed in the guide, but its complete rules are unavailable`);
  await getOrCreateSpellbook(characterId);
  const existing = await db.spells.where("characterId").equals(characterId).toArray();
  if (existing.some((spell) => spell.definitionId === definition.id || spell.referenceDefinitionId === definition.id)) throw new Error(`${definition.name} is already owned by this character`);
  const spell = createSpellFromCatalogDefinition(characterId, definition, choice);
  await db.spells.add(spell);
  await db.characters.update(characterId, { updatedAt: spell.updatedAt });
  return spell;
}

export async function replaceCustomSpellWithSrd(spell: Spell, definition: SrdSpell, sourceClass: string) {
  const catalogDefinition = catalogSpell(definition.id);
  if (!catalogDefinition) throw new Error("Catalog definition not found");
  const association = catalogDefinition.associations.find((candidate) => candidate.sourceClass === sourceClass && candidate.contentSourceId === SRD_CONTENT_SOURCE_ID);
  const choice = association ? { ...association, value: [association.contentSourceId, association.sourceClass].join("|"), label: association.sourceClass } : undefined;
  return replaceCustomSpellWithCatalogDefinition(spell, catalogDefinition, choice);
}

export async function replaceCustomSpellWithCatalogDefinition(spell: Spell, definition: CatalogSpellDefinition, choice?: CatalogSourceChoice) {
  if (!spell.homebrew) throw new Error("Only custom spells can be replaced with catalog data");
  const replacement = spellSchema.parse({
    ...createSpellFromCatalogDefinition(spell.characterId, definition, choice),
    id: spell.id,
    notes: spell.notes || spell.sourceNotes,
    createdAt: spell.createdAt,
    updatedAt: now(),
  });
  await db.spells.put(replacement);
  await db.characters.update(replacement.characterId, { updatedAt: replacement.updatedAt });
  return replacement;
}

export async function createSpell(characterId: string, name: string) {
  if (!name.trim()) throw new Error("Enter a spell name");
  await getOrCreateSpellbook(characterId);
  const spell = createEmptySpell(characterId, name);
  await db.spells.add(spell);
  await db.characters.update(characterId, { updatedAt: spell.updatedAt });
  return spell;
}

export async function saveSpell(spell: Spell) {
  const existing = await db.spells.get(spell.id);
  if (!existing || existing.characterId !== spell.characterId) throw new Error("Spell does not belong to this character");
  const customRulesComplete = spell.referenceDefinitionId ? missingReferenceCompletionFields(spell).length === 0 : spell.definitionId ? spell.rulesComplete : Boolean(
    spell.name.trim()
      && spell.school.trim() && spell.school !== "Custom"
      && spell.castingTime.trim()
      && spell.range.trim()
      && spell.duration.trim()
      && spell.description.trim(),
  );
  const updated = spellSchema.parse({ ...spell, rulesComplete: customRulesComplete, updatedAt: now() });
  await db.spells.put(updated);
  await db.characters.update(updated.characterId, { updatedAt: updated.updatedAt });
  return updated;
}

export async function duplicateSpell(characterId: string, spellId: string) {
  const existing = await db.spells.get(spellId);
  if (!existing || existing.characterId !== characterId) throw new Error("Spell does not belong to this character");
  const timestamp = now();
  const copy = spellSchema.parse({
    ...existing,
    id: crypto.randomUUID(),
    name: `${existing.name} Copy`,
    source: existing.definitionId ? "Homebrew" : existing.source,
    homebrew: existing.definitionId ? true : existing.homebrew,
    definitionId: existing.definitionId ? "" : existing.definitionId,
    definitionVersion: existing.definitionId ? "" : existing.definitionVersion,
    rulesSourceId: existing.definitionId ? "" : existing.rulesSourceId,
    contentSourceId: existing.definitionId ? "" : existing.contentSourceId,
    sourcePage: existing.definitionId ? null : existing.sourcePage,
    sourceNotes: existing.definitionId ? `${existing.sourceNotes}\nCopied as an independent custom definition.`.trim() : existing.sourceNotes,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.spells.add(copy);
  return copy;
}

export async function deleteSpell(characterId: string, spellId: string) {
  const spell = await db.spells.get(spellId);
  if (!spell || spell.characterId !== characterId) throw new Error("Spell does not belong to this character");
  const spellbook = await getOrCreateSpellbook(characterId);
  await db.transaction("rw", db.spells, db.spellbooks, async () => {
    await db.spells.delete(spellId);
    if (spellbook.pinnedSpellIds.includes(spellId)) {
      await db.spellbooks.put(spellbookSchema.parse({
        ...spellbook,
        pinnedSpellIds: spellbook.pinnedSpellIds.filter((id) => id !== spellId),
        updatedAt: now(),
      }));
    }
  });
}

export async function setSpellPinned(characterId: string, spellId: string, pinned: boolean) {
  const spell = await db.spells.get(spellId);
  if (!spell || spell.characterId !== characterId) throw new Error("Spell does not belong to this character");
  const spellbook = await getOrCreateSpellbook(characterId);
  const withoutSpell = spellbook.pinnedSpellIds.filter((id) => id !== spellId);
  const pinnedSpellIds = pinned ? [...withoutSpell, spellId] : withoutSpell;
  const updated = spellbookSchema.parse({ ...spellbook, pinnedSpellIds, updatedAt: now() });
  await db.spellbooks.put(updated);
  return updated;
}

export async function movePinnedSpell(characterId: string, spellId: string, direction: -1 | 1) {
  const spellbook = await getOrCreateSpellbook(characterId);
  const index = spellbook.pinnedSpellIds.indexOf(spellId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= spellbook.pinnedSpellIds.length) return spellbook;
  const pinnedSpellIds = [...spellbook.pinnedSpellIds];
  [pinnedSpellIds[index], pinnedSpellIds[destination]] = [pinnedSpellIds[destination], pinnedSpellIds[index]];
  const updated = spellbookSchema.parse({ ...spellbook, pinnedSpellIds, updatedAt: now() });
  await db.spellbooks.put(updated);
  return updated;
}

export async function copySpellbook(sourceCharacterId: string, targetCharacterId: string) {
  const [sourceBook, sourceSpells] = await Promise.all([
    db.spellbooks.get(sourceCharacterId),
    db.spells.where("characterId").equals(sourceCharacterId).toArray(),
  ]);
  if (!sourceBook && !sourceSpells.length) return;
  const timestamp = now();
  const ids = new Map<string, string>();
  const spells = sourceSpells.map((spell) => {
    const id = crypto.randomUUID();
    ids.set(spell.id, id);
    return spellSchema.parse({ ...spell, id, characterId: targetCharacterId, createdAt: timestamp, updatedAt: timestamp });
  });
  const spellbook = spellbookSchema.parse({
    characterId: targetCharacterId,
    pinnedSpellIds: (sourceBook?.pinnedSpellIds ?? []).map((id) => ids.get(id)).filter((id): id is string => Boolean(id)),
    updatedAt: timestamp,
  });
  await db.transaction("rw", db.spellbooks, db.spells, async () => {
    await db.spellbooks.put(spellbook);
    await db.spells.bulkAdd(spells);
  });
}
