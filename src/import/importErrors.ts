export type ImportParserStage =
  | "reading-file"
  | "loading-pdf"
  | "reading-metadata"
  | "reading-form-fields"
  | "reading-pages"
  | "extracting-text"
  | "normalizing-character"
  | "creating-preview"
  | "saving-import";

export const importParserStageLabels: Record<ImportParserStage, string> = {
  "reading-file": "Reading the selected file",
  "loading-pdf": "Opening the PDF",
  "reading-metadata": "Reading PDF metadata",
  "reading-form-fields": "Reading fillable form fields",
  "reading-pages": "Reading PDF pages",
  "extracting-text": "Extracting character details",
  "normalizing-character": "Organizing character details",
  "creating-preview": "Creating the review preview",
  "saving-import": "Saving the reviewed character",
};

export class ImportParserError extends Error {
  readonly stage: ImportParserStage;
  readonly fileName: string;
  readonly fileId?: string;
  readonly pageCount?: number;
  readonly originalMessage: string;

  constructor(options: {
    stage: ImportParserStage;
    fileName: string;
    fileId?: string;
    pageCount?: number;
    cause?: unknown;
    message?: string;
  }) {
    const originalMessage = options.cause instanceof Error
      ? options.cause.message
      : typeof options.cause === "string"
        ? options.cause
        : options.message ?? "Unknown PDF parsing error";
    super(options.message ?? originalMessage, { cause: options.cause });
    this.name = "ImportParserError";
    this.stage = options.stage;
    this.fileName = options.fileName;
    this.fileId = options.fileId;
    this.pageCount = options.pageCount;
    this.originalMessage = originalMessage;
  }
}

export function asImportParserError(
  error: unknown,
  options: { stage: ImportParserStage; fileName: string; fileId?: string; pageCount?: number },
) {
  if (error instanceof ImportParserError) {
    if (!options.fileId || error.fileId) return error;
    return new ImportParserError({ ...options, stage: error.stage, pageCount: error.pageCount, cause: error.originalMessage });
  }
  return new ImportParserError({ ...options, cause: error });
}

export type ImportFailure = {
  primaryMessage: string;
  stageLabel: string;
  fileName: string;
  fileId?: string;
  technicalDetails: string;
};

export function describeImportFailure(error: unknown, context: {
  fileName?: string;
  fileId?: string;
  buildId: string;
  browser: string;
}): ImportFailure {
  const parsed = error instanceof ImportParserError
    ? error
    : new ImportParserError({ stage: "extracting-text", fileName: context.fileName ?? "Selected file", fileId: context.fileId, cause: error });
  const fileName = parsed.fileName || context.fileName || "Selected file";
  const technicalDetails = [
    `File: ${fileName}`,
    parsed.pageCount == null ? null : `Pages detected: ${parsed.pageCount}`,
    `Stage: ${parsed.stage} (${importParserStageLabels[parsed.stage]})`,
    `Browser: ${context.browser}`,
    `Build: ${context.buildId}`,
    `Original error: ${parsed.originalMessage}`,
  ].filter((value): value is string => Boolean(value)).join("\n");
  return {
    primaryMessage: `${fileName} could not be parsed because the importer encountered an unexpected PDF structure.`,
    stageLabel: importParserStageLabels[parsed.stage],
    fileName,
    fileId: parsed.fileId ?? context.fileId,
    technicalDetails,
  };
}
