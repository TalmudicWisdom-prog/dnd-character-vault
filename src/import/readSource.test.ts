import { describe, expect, it } from "vitest";
import { extractCharacterText } from "./extract";
import { extractPdfDocumentText, type PdfDocumentReader } from "./readSource";

function eightPageSheet(options: { fieldFailure?: boolean; malformedPage?: number } = {}): PdfDocumentReader {
  return {
    numPages: 8,
    getMetadata: async () => { throw new Error("Optional metadata is malformed"); },
    getFieldObjects: options.fieldFailure
      ? async () => { throw new Error("AcroForm tree is malformed"); }
      : async () => ({
        CharacterName: [{ value: "Akiva" }],
        ClassLevel: [{ value: "Druid 14" }],
        Race: [{ value: "Wood Elf" }],
        Background: [{ value: "Hermit" }],
        PlayerName: [{ value: "Yitzak" }],
        STR: [{ value: "10" }], DEX: [{ value: "16" }], CON: [{ value: "14" }],
        INT: [{ value: "12" }], WIS: [{ value: "20" }], CHA: [{ value: "8" }],
        HPCurrent: [{ value: "86" }], HPMax: [{ value: "94" }], AC: [{ value: "17" }],
        Speed: [{ value: "35" }], ProficiencyBonus: [{ value: "+5" }],
        Equipment: [{ value: "Quarterstaff\nExplorer's Pack" }],
        Biography: [{ value: "A wandering keeper of old woods." }],
        Spells0: [{ value: "Druidcraft" }], SpellLevel0: [{ value: "Cantrip" }],
        Spells2: [{ value: "Goodberry" }], SpellLevel2: [{ value: "1" }],
        Spells223: undefined,
      }),
    async getPage(pageNumber) {
      if (pageNumber === options.malformedPage) throw new Error("Broken optional page tree");
      return {
        getAnnotations: async () => pageNumber === 1 ? [{ fieldName: "CharacterName", fieldValue: "Akiva" }] : [],
        getTextContent: async () => ({ items: [{ str: `Embedded page ${pageNumber} character sheet text with readable labels and values.` }] }),
      };
    },
  };
}

describe("fillable multi-page PDF character extraction", () => {
  it("extracts an eight-page AcroForm sheet and normalizes the character preview", async () => {
    const stages: string[] = [];
    const parsed = await extractPdfDocumentText(eightPageSheet({ malformedPage: 6 }), (stage) => stages.push(stage));
    const draft = extractCharacterText(parsed.rawText, "Akiva Character D&D.pdf");

    expect(parsed.pageCount).toBe(8);
    expect(parsed.formFieldCount).toBeGreaterThan(20);
    expect(stages).toEqual(["reading-metadata", "reading-form-fields", "reading-pages", "extracting-text"]);
    expect(draft.name.value).toBe("Akiva");
    expect(draft.characterClass.value).toBe("Druid");
    expect(draft.level.value).toBe(14);
    expect(draft.ancestry.value).toBe("Wood Elf");
    expect(draft.currentHp.value).toBe(86);
    expect(draft.maxHp.value).toBe(94);
    expect(draft.armorClass.value).toBe(17);
    expect(draft.speed.value).toBe(35);
    expect(draft.proficiencyBonus.value).toBe(5);
    expect(draft.biography.value).toBe("A wandering keeper of old woods.");
    expect(draft.inventory.value).toContain("Quarterstaff");
    expect(draft.spellsAndNotes.value).toContain("Druidcraft");
    expect(draft.spellsAndNotes.value).toContain("Goodberry");
  });

  it("continues with embedded text when the optional AcroForm tree fails", async () => {
    const parsed = await extractPdfDocumentText(eightPageSheet({ fieldFailure: true }));
    expect(parsed.formFieldCount).toBe(1);
    expect(parsed.rawText).toContain("Embedded page 8");
  });
});
