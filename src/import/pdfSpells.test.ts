import { describe, expect, it } from "vitest";
import { deduplicateImportedSpells, extractDndBeyondSpellData } from "./pdfSpells";
import type { ImportedSpellRecord } from "../domain/import";

const field = (name: string, value: string) => ({ name, value });

function record(overrides: Partial<ImportedSpellRecord> = {}): ImportedSpellRecord {
  return {
    index: 0, rawName: "Fog Cloud", name: "Fog Cloud", canonicalName: "fog cloud", level: 1,
    prepared: false, alwaysPrepared: false, ritual: false, source: "Druid", saveHit: "",
    castingTime: "1 action", range: "120 feet", components: "V, S", duration: "Concentration, up to 1 hour",
    page: "246", notes: "", variantKey: "", ...overrides,
  };
}

describe("D&D Beyond structured spell fields", () => {
  it("tracks cantrip and level 1 through 7 header boundaries", () => {
    const fields = [
      field("spellCastingAbility0", "WIS"), field("spellSaveDC0", "16"), field("spellAtkBonus0", "+8"), field("spellCastingClass0", "Druid"),
      field("spellHeader0", "=== CANTRIPS ==="), field("spellName0", "Mold Earth"),
      ...Array.from({ length: 7 }, (_, offset) => {
        const level = offset + 1;
        return [field(`spellHeader${level}`, `=== ${level}${level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th"} LEVEL ===`), field(`spellName${level * 20}`, `Level ${level} Spell`)];
      }).flat(),
      field("spellName223", "Reverse Gravity"),
    ];
    const parsed = extractDndBeyondSpellData(fields);
    expect(parsed.spellcasting).toEqual({ ability: "wis", saveDc: 16, attackBonus: 8, sourceClass: "Druid" });
    expect(parsed.spells.find((spell) => spell.name === "Mold Earth")?.level).toBe(0);
    for (let level = 1; level <= 7; level += 1) expect(parsed.spells.find((spell) => spell.name === `Level ${level} Spell`)?.level).toBe(level);
    expect(parsed.spells.find((spell) => spell.name === "Reverse Gravity")?.level).toBe(7);
  });

  it("processes spellName0 through spellName223 without requiring companion fields", () => {
    const parsed = extractDndBeyondSpellData([
      field("spellHeader0", "=== CANTRIPS ==="),
      ...Array.from({ length: 224 }, (_, index) => field(`spellName${index}`, `Spell ${index}`)),
    ]);
    expect(parsed.rawCount).toBe(224);
    expect(parsed.spells).toHaveLength(224);
    expect(parsed.spells[223].name).toBe("Spell 223");
  });

  it("parses P, O, always-prepared, and ritual markers", () => {
    const parsed = extractDndBeyondSpellData([
      field("spellHeader0", "=== 1st LEVEL ==="),
      field("spellName0", "Detect Magic [R]"), field("spellPrepared0", "P"), field("spellSource0", "Druid"),
      field("spellName1", "Entangle"), field("spellPrepared1", "O"), field("spellSource1", "Druid"),
      field("spellName2", "Healing Word"), field("spellPrepared2", "O"), field("spellSource2", "Druid (Always Prepared)"),
    ]);
    expect(parsed.spells[0]).toMatchObject({ name: "Detect Magic", ritual: true, prepared: true, alwaysPrepared: false });
    expect(parsed.spells[1]).toMatchObject({ prepared: false, alwaysPrepared: false });
    expect(parsed.spells[2]).toMatchObject({ prepared: true, alwaysPrepared: true });
  });

  it("merges equivalent duplicates but preserves mechanically different variants", () => {
    const deduplicated = deduplicateImportedSpells([
      record({ index: 1, source: "PHB", prepared: true }),
      record({ index: 2, source: "PHB 2024", page: "250" }),
      record({ index: 3, source: "Variant", duration: "1 hour" }),
    ]);
    expect(deduplicated).toHaveLength(2);
    expect(deduplicated[0].source).toBe("PHB | PHB 2024");
    expect(deduplicated[0].prepared).toBe(true);
    expect(deduplicated[1].duration).toBe("1 hour");
  });
});
