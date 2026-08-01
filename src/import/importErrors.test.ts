import { describe, expect, it } from "vitest";
import { describeImportFailure, ImportParserError } from "./importErrors";

describe("recoverable PDF import errors", () => {
  it("keeps raw Safari errors in technical details instead of the primary message", () => {
    const failure = describeImportFailure(new ImportParserError({
      stage: "loading-pdf",
      fileName: "Akiva Character D&D.pdf",
      fileId: "akiva-file",
      cause: new TypeError("undefined is not a function (near '...i of n...')"),
    }), { buildId: "1.1.0-pdf-test", browser: "Mobile Safari 17.3" });

    expect(failure.primaryMessage).toBe("Akiva Character D&D.pdf could not be parsed because the importer encountered an unexpected PDF structure.");
    expect(failure.primaryMessage).not.toContain("undefined is not a function");
    expect(failure.stageLabel).toBe("Opening the PDF");
    expect(failure.fileId).toBe("akiva-file");
    expect(failure.technicalDetails).toContain("Stage: loading-pdf");
    expect(failure.technicalDetails).toContain("Original error: undefined is not a function");
  });
});
