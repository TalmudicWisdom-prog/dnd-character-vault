import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function recognizeImage(source: Blob | HTMLCanvasElement, onStatus: (message: string) => void) {
  const { createWorker } = await import("tesseract.js");
  const appAsset = (path: string) => new URL(path, document.baseURI).href;
  const worker = await createWorker("eng", undefined, {
    workerPath: appAsset("ocr/worker.min.js"),
    corePath: appAsset("ocr/core"),
    langPath: appAsset("ocr"),
    logger: (message) => {
      if (message.status) onStatus(`${message.status}${message.progress ? ` ${Math.round(message.progress * 100)}%` : ""}`);
    },
  });
  try {
    const result = await worker.recognize(source);
    return { rawText: result.data.text, confidence: result.data.confidence / 100 };
  } finally {
    await worker.terminate();
  }
}

async function renderPage(pdf: Awaited<ReturnType<typeof getDocument>["promise"]>, pageNumber: number) {
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

export type ReadSourceResult = { rawText: string; pageCount: number; confidence: number | null };

export async function readCharacterSheetSource(file: Blob & { name?: string }, onStatus: (message: string) => void): Promise<ReadSourceResult> {
  const fileName = file.name ?? "Imported file";
  const isPdf = file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    if (!file.type.startsWith("image/")) throw new Error("Choose a PDF or image file");
    onStatus("Reading photo locally...");
    const result = await recognizeImage(file, onStatus);
    return { ...result, pageCount: 1 };
  }

  onStatus("Reading PDF text locally...");
  const data = await file.arrayBuffer();
  const loadingTask = getDocument({ data });
  const pdf = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 8); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
    }
    const embeddedText = pages.join("\n");
    if (embeddedText.replace(/\s/g, "").length >= 120) return { rawText: embeddedText, pageCount: pdf.numPages, confidence: 0.95 };

    const ocrPages: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber += 1) {
      onStatus(`Scanning PDF page ${pageNumber} locally...`);
      ocrPages.push((await recognizeImage(await renderPage(pdf, pageNumber), onStatus)).rawText);
    }
    return { rawText: ocrPages.join("\n"), pageCount: pdf.numPages, confidence: null };
  } finally {
    await loadingTask.destroy();
  }
}
