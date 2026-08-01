import { describe, expect, it } from "vitest";
import { extractPdfFormFields, pdfFormFieldsToText } from "./pdfFields";

describe("defensive PDF form-field normalization", () => {
  it("accepts absent and non-iterable PDF.js collections", () => {
    expect(extractPdfFormFields(undefined)).toEqual([]);
    expect(extractPdfFormFields({ CharacterName: undefined }, { not: "an array" })).toEqual([]);
    expect(() => pdfFormFieldsToText(extractPdfFormFields({ Spells0: null, Spells223: { value: "" } }))).not.toThrow();
  });

  it("deduplicates widget copies and preserves sparse numbered spells", () => {
    const fields = extractPdfFormFields({
      CharacterName: [{ value: "Akiva" }],
      Spells0: [{ value: "Druidcraft" }],
      SpellLevel0: [{ value: "Cantrip" }],
      Spells2: [{ value: "Goodberry" }],
      SpellLevel2: [{ value: "1" }],
      Spells223: [{ value: "Storm of Vengeance" }],
      SpellLevel223: [{ value: "9" }],
    }, [[
      { fieldName: "CharacterName", fieldValue: "Akiva" },
      { fieldName: "Spells2", fieldValue: "Goodberry" },
    ]]);
    const text = pdfFormFieldsToText(fields);
    expect(fields.filter((field) => field.name === "CharacterName")).toHaveLength(1);
    expect(text).toContain("Character Name: Akiva");
    expect(text).toContain("Druidcraft — Level Cantrip");
    expect(text).toContain("Goodberry — Level 1");
    expect(text).toContain("Storm of Vengeance — Level 9");
  });

  it("handles more than 200 optional fields without assuming contiguous indexes", () => {
    const source = Object.fromEntries(Array.from({ length: 230 }, (_, index) => [
      `OptionalField${index}`,
      index % 31 === 0 ? [{ value: `Value ${index}` }] : undefined,
    ]));
    expect(extractPdfFormFields(source)).toHaveLength(8);
  });

  it("keeps every populated spell slot across a 224-record form", () => {
    const source = Object.fromEntries(Array.from({ length: 224 }, (_, index) => [
      `Spells${index}`,
      [{ value: `Spell Variant ${index}` }],
    ]));
    const text = pdfFormFieldsToText(extractPdfFormFields(source));
    expect(text).toContain("Spell Variant 0");
    expect(text).toContain("Spell Variant 223");
    expect(text.match(/Spell Variant/g)).toHaveLength(224);
  });
});
