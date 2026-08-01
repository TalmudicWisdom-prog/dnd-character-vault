import type { AbilityId } from "../domain/models";
import type { ImportedSpellRecord, ParsedImportedSpells } from "../domain/import";
import type { PdfFormField } from "./pdfFields";

type SpellPart = "name" | "level" | "prepared" | "source" | "saveHit" | "castingTime" | "range" | "components" | "duration" | "page" | "notes";

function compactName(name: string) {
  return name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function canonicalImportedSpellName(value: string) {
  return value.replace(/\s*\[R\]\s*/gi, " ").trim().replace(/\s+/g, " ");
}

function canonicalKey(value: string) {
  return canonicalImportedSpellName(value).toLocaleLowerCase().replace(/[’]/g, "'");
}

function fieldIdentity(name: string): { index: number; part: SpellPart } | null {
  const compact = compactName(name);
  const patterns: Array<[SpellPart, RegExp]> = [
    ["name", /^spellname(\d+)$/],
    ["level", /^spelllevel(\d+)$/],
    ["prepared", /^spellprepared(\d+)$/],
    ["source", /^spellsource(\d+)$/],
    ["saveHit", /^spellsavehit(\d+)$/],
    ["castingTime", /^spellcastingtime(\d+)$/],
    ["range", /^spellrange(\d+)$/],
    ["components", /^spellcomponents(\d+)$/],
    ["duration", /^spellduration(\d+)$/],
    ["page", /^spellpage(\d+)$/],
    ["notes", /^spellnotes(\d+)$/],
  ];
  for (const [part, pattern] of patterns) {
    const match = compact.match(pattern);
    if (match) return { index: Number(match[1]), part };
  }
  return null;
}

export function spellLevelFromHeader(value: string): number | null {
  const normalized = value.replace(/=/g, " ").trim().toLocaleLowerCase();
  if (normalized.includes("cantrip")) return 0;
  const match = normalized.match(/\b([1-9])(?:st|nd|rd|th)?\s+level\b/);
  return match ? Number(match[1]) : null;
}

function parseLevel(value: string) {
  if (/cantrip/i.test(value)) return 0;
  const number = value.match(/\b([0-9])\b/)?.[1];
  return number == null ? null : Number(number);
}

function normalizedMechanic(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function mechanicsConflict(left: ImportedSpellRecord, right: ImportedSpellRecord) {
  return (["castingTime", "range", "components", "duration", "saveHit"] as const).some((key) => {
    const leftValue = normalizedMechanic(left[key]);
    const rightValue = normalizedMechanic(right[key]);
    return Boolean(leftValue && rightValue && leftValue !== rightValue);
  });
}

function variantKey(spell: Pick<ImportedSpellRecord, "canonicalName" | "level" | "castingTime" | "range" | "components" | "duration" | "saveHit">) {
  return [spell.canonicalName, spell.level ?? "unknown", spell.castingTime, spell.range, spell.components, spell.duration, spell.saveHit]
    .map((value) => normalizedMechanic(String(value))).join("|");
}

function mergeText(left: string, right: string) {
  return [...new Set([left, right].flatMap((value) => value.split(" | ")).map((value) => value.trim()).filter(Boolean))].join(" | ");
}

export function deduplicateImportedSpells(records: ImportedSpellRecord[]) {
  const deduplicated: ImportedSpellRecord[] = [];
  for (const record of records) {
    const equivalent = deduplicated.find((candidate) =>
      candidate.canonicalName === record.canonicalName
      && candidate.level === record.level
      && !mechanicsConflict(candidate, record));
    if (!equivalent) {
      deduplicated.push({ ...record, variantKey: variantKey(record) });
      continue;
    }
    equivalent.prepared ||= record.prepared;
    equivalent.alwaysPrepared ||= record.alwaysPrepared;
    equivalent.ritual ||= record.ritual;
    equivalent.source = mergeText(equivalent.source, record.source);
    equivalent.page = mergeText(equivalent.page, record.page);
    equivalent.notes = mergeText(equivalent.notes, record.notes);
    for (const key of ["castingTime", "range", "components", "duration", "saveHit"] as const) {
      if (!equivalent[key] && record[key]) equivalent[key] = record[key];
    }
    equivalent.variantKey = variantKey(equivalent);
  }
  return deduplicated;
}

function ability(value: string): AbilityId | null {
  const normalized = value.trim().slice(0, 3).toLocaleLowerCase();
  return (["str", "dex", "con", "int", "wis", "cha"] as AbilityId[]).includes(normalized as AbilityId) ? normalized as AbilityId : null;
}

function firstNumber(value: string) {
  const match = value.match(/[+-]?\d+/)?.[0];
  return match == null ? null : Number(match);
}

export function extractDndBeyondSpellData(fields: PdfFormField[]): ParsedImportedSpells {
  const groups = new Map<number, Partial<Record<SpellPart, string>> & { boundaryLevel?: number | null }>();
  let currentLevel: number | null = null;
  let castingAbility: AbilityId | null = null;
  let saveDc: number | null = null;
  let attackBonus: number | null = null;
  let sourceClass = "";

  for (const field of fields) {
    const compact = compactName(field.name);
    if (/^spell(?:slot)?header\d+$/.test(compact)) {
      const headerLevel = spellLevelFromHeader(field.value);
      if (headerLevel !== null) currentLevel = headerLevel;
      continue;
    }
    if (/^spellcastingability\d*$/.test(compact)) { castingAbility ??= ability(field.value); continue; }
    if (/^spellsavedc\d*$/.test(compact)) { saveDc ??= firstNumber(field.value); continue; }
    if (/^spellatkbonus\d*$/.test(compact) || /^spellattackbonus\d*$/.test(compact)) { attackBonus ??= firstNumber(field.value); continue; }
    if (/^spellcastingclass\d*$/.test(compact)) { sourceClass ||= field.value.trim(); continue; }
    const identity = fieldIdentity(field.name);
    if (!identity || identity.index < 0 || identity.index > 10000) continue;
    const group = groups.get(identity.index) ?? { boundaryLevel: currentLevel };
    if (!group[identity.part]) group[identity.part] = field.value;
    if (group.boundaryLevel == null && currentLevel != null) group.boundaryLevel = currentLevel;
    groups.set(identity.index, group);
  }

  const rawRecords: ImportedSpellRecord[] = [];
  for (const [index, group] of [...groups.entries()].sort(([left], [right]) => left - right)) {
    const rawName = group.name?.trim() ?? "";
    if (!rawName) continue;
    const name = canonicalImportedSpellName(rawName);
    const source = group.source?.trim() ?? "";
    const preparedMarker = group.prepared?.trim().toLocaleUpperCase() ?? "";
    const alwaysPrepared = /always\s+prepared/i.test(source);
    const ritual = /\[R\]/i.test(rawName) || /\britual\b/i.test(source);
    const level = group.level ? parseLevel(group.level) : group.boundaryLevel ?? null;
    const record: ImportedSpellRecord = {
      index,
      rawName,
      name,
      canonicalName: canonicalKey(name),
      level,
      prepared: alwaysPrepared || preparedMarker === "P" || /^(?:YES|TRUE|ON|PREPARED)$/.test(preparedMarker),
      alwaysPrepared,
      ritual,
      source,
      saveHit: group.saveHit?.trim() ?? "",
      castingTime: group.castingTime?.trim() ?? "",
      range: group.range?.trim() ?? "",
      components: group.components?.trim() ?? "",
      duration: group.duration?.trim() ?? "",
      page: group.page?.trim() ?? "",
      notes: group.notes?.trim() ?? "",
      variantKey: "",
    };
    record.variantKey = variantKey(record);
    rawRecords.push(record);
  }

  return {
    rawCount: rawRecords.length,
    spells: deduplicateImportedSpells(rawRecords),
    spellcasting: { ability: castingAbility, saveDc, attackBonus, sourceClass },
  };
}
