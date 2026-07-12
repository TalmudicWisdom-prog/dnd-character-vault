import type { Spell, Spellbook } from "../domain/models";
import { spellSchema, spellbookSchema } from "../domain/models";
import type { SrdSpell } from "../rules/srd";
import { actionTypeFromCastingTime, SRD_SPELL_CATALOG_VERSION } from "../rules/spellCatalog";
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
    sourceClass: "",
    castingAbilityOverride: null,
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createSpellFromSrd(characterId: string, spell: SrdSpell, sourceClass = ""): Spell {
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
    sourceClass,
    castingAbilityOverride: null,
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function addSpellFromCatalog(characterId: string, definition: SrdSpell, sourceClass: string) {
  if (!sourceClass.trim()) throw new Error("Choose the spell's source class");
  await getOrCreateSpellbook(characterId);
  const existing = await db.spells.where("characterId").equals(characterId).toArray();
  if (existing.some((spell) => spell.definitionId === definition.id)) throw new Error(`${definition.name} is already owned by this character`);
  const spell = createSpellFromSrd(characterId, definition, sourceClass);
  await db.spells.add(spell);
  await db.characters.update(characterId, { updatedAt: spell.updatedAt });
  return spell;
}

export async function replaceCustomSpellWithSrd(spell: Spell, definition: SrdSpell, sourceClass: string) {
  if (!spell.homebrew) throw new Error("Only custom spells can be replaced with catalog data");
  const replacement = spellSchema.parse({
    ...createSpellFromSrd(spell.characterId, definition, sourceClass),
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
  const updated = spellSchema.parse({ ...spell, updatedAt: now() });
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
