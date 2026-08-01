export type PdfFormField = { name: string; value: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(nonEmptyString).filter(Boolean).join(", ");
  return "";
}

function fieldValue(value: unknown): string {
  if (!isRecord(value)) return nonEmptyString(value);
  for (const key of ["fieldValue", "value", "buttonValue", "exportValue", "alternativeText"]) {
    const candidate = nonEmptyString(value[key]);
    if (candidate && candidate.toLowerCase() !== "off") return candidate;
  }
  return "";
}

function addField(target: PdfFormField[], seen: Set<string>, nameValue: unknown, value: unknown) {
  const name = nonEmptyString(nameValue);
  const resolved = fieldValue(value);
  if (!name || !resolved) return;
  const key = `${name.toLocaleLowerCase()}\u0000${resolved.toLocaleLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push({ name, value: resolved });
}

export function extractPdfFormFields(fieldObjects: unknown, annotations: unknown = []): PdfFormField[] {
  const fields: PdfFormField[] = [];
  const seen = new Set<string>();
  if (isRecord(fieldObjects)) {
    for (const [name, candidate] of Object.entries(fieldObjects)) {
      if (Array.isArray(candidate)) {
        for (const item of candidate) addField(fields, seen, name, item);
      } else {
        addField(fields, seen, name, candidate);
      }
    }
  }
  if (Array.isArray(annotations)) {
    for (const annotationGroup of annotations) {
      const group = Array.isArray(annotationGroup) ? annotationGroup : [annotationGroup];
      for (const annotation of group) {
        if (!isRecord(annotation)) continue;
        addField(fields, seen, annotation.fieldName ?? annotation.alternativeText, annotation);
      }
    }
  }
  return fields;
}

function normalizedName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const canonicalLabels: Record<string, string> = {
  charactername: "Character Name",
  classlevel: "Class & Level",
  classandlevel: "Class & Level",
  race: "Race",
  species: "Species",
  ancestry: "Ancestry",
  background: "Background",
  playername: "Player Name",
  strength: "Strength",
  str: "Strength",
  strengthscore: "Strength",
  strscore: "Strength",
  dexterity: "Dexterity",
  dex: "Dexterity",
  dexterityscore: "Dexterity",
  dexscore: "Dexterity",
  constitution: "Constitution",
  con: "Constitution",
  constitutionscore: "Constitution",
  conscore: "Constitution",
  intelligence: "Intelligence",
  int: "Intelligence",
  intelligencescore: "Intelligence",
  intscore: "Intelligence",
  wisdom: "Wisdom",
  wis: "Wisdom",
  wisdomscore: "Wisdom",
  wisscore: "Wisdom",
  charisma: "Charisma",
  cha: "Charisma",
  charismascore: "Charisma",
  chascore: "Charisma",
  currenthp: "Current HP",
  hpcurrent: "Current HP",
  currenthitpoints: "Current HP",
  hpmax: "Max HP",
  maxhp: "Max HP",
  hitpointmaximum: "Max HP",
  armorclass: "Armor Class",
  ac: "Armor Class",
  initiative: "Initiative",
  speed: "Speed",
  proficiencybonus: "Proficiency Bonus",
  profbonus: "Proficiency Bonus",
  proficiencymodifier: "Proficiency Bonus",
  equipment: "Equipment",
  inventory: "Inventory",
  treasure: "Treasure",
  featuresandtraits: "Features & Traits",
  features: "Features",
  traits: "Traits",
  biography: "Biography",
  backstory: "Biography",
  notes: "Notes",
};

type SpellPart = "name" | "level" | "source" | "castingTime" | "range" | "components" | "duration" | "notes" | "prepared";

function spellIdentity(name: string): { index: string; part: SpellPart } | null {
  const compact = normalizedName(name);
  const patterns: Array<[SpellPart, RegExp]> = [
    ["name", /^(?:spellname|spells?)(\d+)$/],
    ["level", /^(?:spelllevel|levelspell)(\d+)$/],
    ["source", /^(?:spellsource|sourcespell)(\d+)$/],
    ["castingTime", /^(?:spellcastingtime|castingspell)(\d+)$/],
    ["range", /^(?:spellrange|rangespell)(\d+)$/],
    ["components", /^(?:spellcomponents|componentsspell)(\d+)$/],
    ["duration", /^(?:spellduration|durationspell)(\d+)$/],
    ["notes", /^(?:spellnotes|notesspell)(\d+)$/],
    ["prepared", /^(?:spellprepared|preparedspell)(\d+)$/],
  ];
  for (const [part, pattern] of patterns) {
    const match = compact.match(pattern);
    if (match) return { index: match[1], part };
  }
  return null;
}

export function pdfFormFieldsToText(fields: PdfFormField[]): string {
  const lines: string[] = [];
  const spellGroups = new Map<string, Partial<Record<SpellPart, string>>>();
  for (const field of fields) {
    const spell = spellIdentity(field.name);
    if (spell) {
      const group = spellGroups.get(spell.index) ?? {};
      if (!group[spell.part]) group[spell.part] = field.value;
      spellGroups.set(spell.index, group);
      continue;
    }
    const compact = normalizedName(field.name);
    const label = canonicalLabels[compact] ?? field.name.replace(/[_-]+/g, " ").trim();
    lines.push(`${label}: ${field.value}`);
  }

  const spells: string[] = [];
  const seenSpells = new Set<string>();
  for (const group of spellGroups.values()) {
    const name = group.name?.trim();
    if (!name) continue;
    const identity = [name, group.level, group.source, group.castingTime, group.range].map((part) => part?.trim().toLowerCase() ?? "").join("|");
    if (seenSpells.has(identity)) continue;
    seenSpells.add(identity);
    const details = [
      group.level && `Level ${group.level}`,
      group.source && `Source ${group.source}`,
      group.castingTime && `Casting time ${group.castingTime}`,
      group.range && `Range ${group.range}`,
      group.components && `Components ${group.components}`,
      group.duration && `Duration ${group.duration}`,
      group.notes,
      group.prepared && `Prepared ${group.prepared}`,
    ].filter(Boolean).join("; ");
    spells.push(details ? `${name} — ${details}` : name);
  }
  if (spells.length) lines.push("Spells", ...spells);
  return lines.join("\n");
}
