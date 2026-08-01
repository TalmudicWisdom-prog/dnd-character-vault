import type { ImportedSpellRecord } from "../domain/import";
import type { Spell } from "../domain/models";
import { catalogSpells, actionTypeFromCastingTime, normalizeSpellName } from "../rules/spellCatalog";
import { SRD_CONTENT_SOURCE_ID } from "../rules/contentSources";
import { db } from "../storage/database";
import { createEmptySpell, createSpellFromCatalogDefinition, getOrCreateSpellbook } from "../storage/spellbooks";
import { createEmptyCharacterSheet } from "../storage/characterSheets";
import { characterSheetSchema } from "../domain/models";
import { readCharacterSheetSource } from "./readSource";

function catalogMatch(record: ImportedSpellRecord) {
  if (record.level === null) return undefined;
  const matches = catalogSpells.filter((definition) =>
    definition.definitionStatus === "complete"
    && definition.level === record.level
    && normalizeSpellName(definition.name) === record.canonicalName);
  return matches.find((definition) => definition.rulesSourceId === SRD_CONTENT_SOURCE_ID) ?? matches[0];
}

function sourceClass(record: ImportedSpellRecord, fallback: string) {
  return (record.source.replace(/\s*\([^)]*\)\s*$/, "").trim() || fallback).slice(0, 100);
}

function pageNumber(value: string) {
  const page = value.match(/\d+/)?.[0];
  return page ? Math.max(1, Number(page)) : null;
}

function componentFlags(value: string) {
  const tokens = value.toLocaleUpperCase().split(/[^A-Z]+/).filter(Boolean);
  return { verbalComponent: tokens.includes("V"), somaticComponent: tokens.includes("S"), materialComponent: tokens.includes("M") };
}

function savingThrow(value: string) {
  return value.toLocaleUpperCase().match(/\b(STR|DEX|CON|INT|WIS|CHA)\b/)?.[1] ?? "";
}

function importedNotes(record: ImportedSpellRecord, sourceName: string) {
  return [
    `Imported from: ${sourceName}`,
    `PDF spell field: spellName${record.index}`,
    record.source && `PDF source: ${record.source}`,
    record.page && `PDF page/reference: ${record.page}`,
    record.saveHit && `PDF save/attack: ${record.saveHit}`,
    record.notes,
  ].filter(Boolean).join("\n");
}

export function createImportedSpell(characterId: string, record: ImportedSpellRecord, sourceName: string, spellcastingClass = ""): Spell {
  const match = catalogMatch(record);
  const timestamp = new Date().toISOString();
  const common = {
    characterId,
    level: record.level ?? 0,
    levelKnown: record.level !== null,
    prepared: record.prepared,
    alwaysPrepared: record.alwaysPrepared,
    ritual: record.ritual,
    imported: true,
    importSourceName: sourceName,
    importSourceIndex: record.index,
    importVariantKey: record.variantKey,
    sourceClass: sourceClass(record, spellcastingClass),
    sourcePage: pageNumber(record.page),
    sourceNotes: importedNotes(record, sourceName),
    notes: record.notes,
    updatedAt: timestamp,
  };
  if (match) {
    const catalogSpell = createSpellFromCatalogDefinition(characterId, match);
    return {
    ...catalogSpell,
    ...common,
    sourceNotes: [catalogSpell.sourceNotes, common.sourceNotes].filter(Boolean).join("\n\n"),
    };
  }

  const components = componentFlags(record.components);
  return {
    ...createEmptySpell(characterId, record.name),
    ...common,
    name: record.name,
    school: "Unspecified",
    castingTime: record.castingTime || "Unspecified",
    actionType: actionTypeFromCastingTime(record.castingTime),
    range: record.range || "Unspecified",
    ...components,
    duration: record.duration || "Unspecified",
    concentration: /concentration/i.test(record.duration),
    savingThrowType: savingThrow(record.saveHit),
    attackRollRequired: /attack|(?:^|\s)[+-]\d+/.test(record.saveHit.toLocaleLowerCase()),
    source: "Homebrew",
    homebrew: true,
    definitionId: "",
    definitionVersion: "",
    rulesSourceId: "",
    contentSourceId: "",
    rulesComplete: false,
  };
}

export type ImportedSpellReview = {
  rawCount: number;
  uniqueCount: number;
  preparedCount: number;
  alwaysPreparedCount: number;
  customCount: number;
  matchedCount: number;
  variantCount: number;
  unknownLevelCount: number;
};

export function reviewImportedSpells(rawCount: number, records: ImportedSpellRecord[]): ImportedSpellReview {
  const grouped = new Map<string, number>();
  for (const record of records) {
    const key = `${record.canonicalName}|${record.level ?? "unknown"}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  const matchedCount = records.filter(catalogMatch).length;
  return {
    rawCount,
    uniqueCount: records.length,
    preparedCount: records.filter((spell) => spell.prepared && !spell.alwaysPrepared).length,
    alwaysPreparedCount: records.filter((spell) => spell.alwaysPrepared).length,
    customCount: records.length - matchedCount,
    matchedCount,
    variantCount: [...grouped.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    unknownLevelCount: records.filter((spell) => spell.level === null).length,
  };
}

export type PersistImportedSpellsResult = {
  detected: number;
  imported: number;
  matched: number;
  custom: number;
  skippedExisting: number;
};

export async function persistImportedSpells(characterId: string, records: ImportedSpellRecord[], sourceName: string, spellcastingClass = ""): Promise<PersistImportedSpellsResult> {
  await getOrCreateSpellbook(characterId);
  const existing = await db.spells.where("characterId").equals(characterId).toArray();
  const existingKeys = new Set(existing.filter((spell) => spell.imported && spell.importVariantKey).map((spell) => spell.importVariantKey));
  const additions: Spell[] = [];
  let skippedExisting = 0;
  for (const record of records) {
    if (existingKeys.has(record.variantKey)) {
      skippedExisting += 1;
      continue;
    }
    const spell = createImportedSpell(characterId, record, sourceName, spellcastingClass);
    additions.push(spell);
    existingKeys.add(record.variantKey);
  }
  if (additions.length) await db.spells.bulkAdd(additions);
  return {
    detected: records.length,
    imported: additions.length,
    matched: additions.filter((spell) => Boolean(spell.definitionId)).length,
    custom: additions.filter((spell) => !spell.definitionId).length,
    skippedExisting,
  };
}

export async function reimportSpellsFromLinkedPdf(characterId: string, documentId: string, onStatus?: (message: string) => void) {
  const [character, document, storedFile] = await Promise.all([
    db.characters.get(characterId),
    db.pdfDocuments.get(documentId),
    db.pdfFiles.get(documentId),
  ]);
  if (!character) throw new Error("Character not found");
  if (!document || !document.characterIds.includes(characterId)) throw new Error("That PDF is not linked to this character");
  if (!storedFile) throw new Error("The linked PDF file is unavailable on this device");
  const file = new File([storedFile.data], document.fileName, { type: "application/pdf" });
  const parsed = await readCharacterSheetSource(file, onStatus);
  const spellData = parsed.spellData;
  if (!spellData?.spells.length) return { detected: 0, imported: 0, matched: 0, custom: 0, skippedExisting: 0 } satisfies PersistImportedSpellsResult;

  return db.transaction("rw", [db.spells, db.spellbooks, db.characterSheets, db.characters], async () => {
    const result = await persistImportedSpells(characterId, spellData.spells, document.fileName, spellData.spellcasting.sourceClass || character.characterClass);
    const sheet = await db.characterSheets.get(characterId) ?? createEmptyCharacterSheet(characterId);
    if (spellData.spellcasting.ability) sheet.spellcastingAbility = spellData.spellcasting.ability;
    if (spellData.spellcasting.saveDc != null) sheet.spellSaveDc = spellData.spellcasting.saveDc;
    if (spellData.spellcasting.attackBonus != null) sheet.spellAttackBonus = spellData.spellcasting.attackBonus;
    sheet.cantrips = mergeSpellNames(sheet.cantrips, spellData.spells.filter((spell) => spell.level === 0).map((spell) => spell.name));
    sheet.preparedSpells = mergeSpellNames(sheet.preparedSpells, spellData.spells.filter((spell) => spell.level !== 0 && (spell.prepared || spell.alwaysPrepared)).map((spell) => spell.name));
    sheet.updatedAt = new Date().toISOString();
    await db.characterSheets.put(characterSheetSchema.parse(sheet));
    await db.characters.update(characterId, { updatedAt: sheet.updatedAt });
    return result;
  });
}

function mergeSpellNames(existing: string, names: string[]) {
  return [...new Set([...existing.split(/[,\n]/), ...names].map((name) => name.trim()).filter(Boolean))].join("\n");
}
