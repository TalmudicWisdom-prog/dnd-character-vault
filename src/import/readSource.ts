import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { asImportParserError, type ImportParserStage } from "./importErrors";
import { extractPdfFormFields, pdfFormFieldsToText } from "./pdfFields";
import { extractDndBeyondSpellData } from "./pdfSpells";
import type { ParsedImportedSpells } from "../domain/import";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type StatusCallback = (message: string) => void;
type StageCallback = (stage: ImportParserStage, message: string) => void;

type PdfPageReader = {
  getTextContent?: () => Promise<unknown>;
  getAnnotations?: (options?: { intent?: string }) => Promise<unknown>;
};

export type PdfDocumentReader = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageReader>;
  getFieldObjects?: () => Promise<unknown>;
  getMetadata?: () => Promise<unknown>;
};

function report(onStatus: StatusCallback | undefined, message: string) {
  if (typeof onStatus === "function") onStatus(message);
}

async function recognizeImage(source: Blob | HTMLCanvasElement, onStatus?: StatusCallback) {
  const { createWorker } = await import("tesseract.js");
  const appAsset = (path: string) => new URL(path, document.baseURI).href;
  const worker = await createWorker("eng", undefined, {
    workerPath: appAsset("ocr/worker.min.js"),
    corePath: appAsset("ocr/core"),
    langPath: appAsset("ocr"),
    logger: (message) => {
      if (message.status) report(onStatus, `${message.status}${message.progress ? ` ${Math.round(message.progress * 100)}%` : ""}`);
    },
  });
  try {
    const result = await worker.recognize(source);
    return { rawText: result.data.text, confidence: result.data.confidence / 100 };
  } finally {
    await worker.terminate();
  }
}

async function renderPage(pdf: PDFDocumentProxy, pageNumber: number) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.7 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare OCR canvas");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}

async function readBlobAsArrayBuffer(file: Blob) {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("The selected file could not be read"));
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(reader.result)
      : reject(new Error("The selected file did not produce readable PDF data"));
    reader.readAsArrayBuffer(file);
  });
}

function textFromContent(content: unknown) {
  if (typeof content !== "object" || content === null || !("items" in content)) return "";
  const items = (content as { items?: unknown }).items;
  if (!Array.isArray(items)) return "";
  return items.map((item) => {
    if (typeof item !== "object" || item === null || !("str" in item)) return "";
    return typeof (item as { str?: unknown }).str === "string" ? (item as { str: string }).str : "";
  }).filter(Boolean).join(" ");
}

export type ExtractedPdfDocument = {
  rawText: string;
  pageCount: number;
  formFieldCount: number;
  formCharacterCount: number;
  embeddedCharacterCount: number;
  spellData: ParsedImportedSpells;
};

export async function extractPdfDocumentText(pdf: PdfDocumentReader, onStage?: StageCallback): Promise<ExtractedPdfDocument> {
  onStage?.("reading-metadata", "Reading PDF metadata locally...");
  if (typeof pdf.getMetadata === "function") {
    try { await pdf.getMetadata(); } catch { /* Metadata is optional and never blocks character extraction. */ }
  }

  let fieldObjects: unknown;
  onStage?.("reading-form-fields", "Reading fillable character fields locally...");
  if (typeof pdf.getFieldObjects === "function") {
    try { fieldObjects = await pdf.getFieldObjects(); } catch { fieldObjects = undefined; }
  }

  const pageText: string[] = [];
  const pageAnnotations: unknown[] = [];
  const pagesToRead = Math.min(Math.max(0, Number.isFinite(pdf.numPages) ? pdf.numPages : 0), 8);
  onStage?.("reading-pages", `Reading ${pagesToRead} PDF ${pagesToRead === 1 ? "page" : "pages"} locally...`);
  for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
    let page: PdfPageReader;
    try {
      page = await pdf.getPage(pageNumber);
    } catch {
      pageText.push("");
      pageAnnotations.push([]);
      continue;
    }
    if (typeof page.getAnnotations === "function") {
      try { pageAnnotations.push(await page.getAnnotations({ intent: "display" })); } catch { pageAnnotations.push([]); }
    } else {
      pageAnnotations.push([]);
    }
    if (typeof page.getTextContent === "function") {
      try { pageText.push(textFromContent(await page.getTextContent())); } catch { pageText.push(""); }
    } else {
      pageText.push("");
    }
  }

  onStage?.("extracting-text", "Organizing extracted PDF details locally...");
  const formFields = extractPdfFormFields(fieldObjects, pageAnnotations);
  const formText = pdfFormFieldsToText(formFields);
  const spellData = extractDndBeyondSpellData(formFields);
  const embeddedText = pageText.filter(Boolean).join("\n");
  return {
    rawText: [formText, embeddedText].filter(Boolean).join("\n\n"),
    pageCount: Math.max(0, Number.isFinite(pdf.numPages) ? pdf.numPages : 0),
    formFieldCount: formFields.length,
    formCharacterCount: formText.replace(/\s/g, "").length,
    embeddedCharacterCount: embeddedText.replace(/\s/g, "").length,
    spellData,
  };
}

export type ReadSourceResult = { rawText: string; pageCount: number; confidence: number | null; spellData?: ParsedImportedSpells };

export async function readCharacterSheetSource(file: Blob & { name?: string }, onStatus?: StatusCallback): Promise<ReadSourceResult> {
  const fileName = file.name ?? "Imported file";
  const isPdf = file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    if (!file.type.startsWith("image/")) throw new Error("Choose a PDF or image file");
    report(onStatus, "Reading photo locally...");
    const result = await recognizeImage(file, onStatus);
    return { ...result, pageCount: 1 };
  }

  let stage: ImportParserStage = "reading-file";
  let pageCount: number | undefined;
  let loadingTask: ReturnType<typeof getDocument> | undefined;
  try {
    report(onStatus, "Reading PDF file locally...");
    const data = await readBlobAsArrayBuffer(file);
    stage = "loading-pdf";
    report(onStatus, "Opening PDF locally...");
    loadingTask = getDocument({ data });
    const pdf = await loadingTask.promise;
    pageCount = pdf.numPages;
    const extracted = await extractPdfDocumentText(pdf, (nextStage, message) => {
      stage = nextStage;
      report(onStatus, message);
    });
    if (extracted.formFieldCount >= 3 || extracted.formCharacterCount >= 80 || extracted.embeddedCharacterCount >= 120) {
      return { rawText: extracted.rawText, pageCount: extracted.pageCount, confidence: extracted.formFieldCount > 0 ? 0.98 : 0.95, spellData: extracted.spellData };
    }

    stage = "extracting-text";
    const ocrPages: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber += 1) {
      report(onStatus, `Scanning PDF page ${pageNumber} locally...`);
      ocrPages.push((await recognizeImage(await renderPage(pdf, pageNumber), onStatus)).rawText);
    }
    return {
      rawText: [extracted.rawText, ocrPages.join("\n")].filter(Boolean).join("\n\n"),
      pageCount: pdf.numPages,
      confidence: null,
      spellData: extracted.spellData,
    };
  } catch (error) {
    throw asImportParserError(error, { stage, fileName, pageCount });
  } finally {
    const destroy = loadingTask?.destroy;
    if (typeof destroy === "function") {
      try { await destroy.call(loadingTask); } catch { /* Cleanup errors must not replace the parse result. */ }
    }
  }
}
