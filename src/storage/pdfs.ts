import type { PdfBookmark, PdfDocument } from "../domain/models";
import { pdfBookmarkSchema, pdfDocumentSchema } from "../domain/models";
import { db } from "./database";

function now() {
  return new Date().toISOString();
}

export async function importPdf(file: File, gameSystem: string, characterIds: string[]) {
  if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase().endsWith(".pdf")) {
    throw new Error("Choose a PDF file");
  }

  const timestamp = now();
  const document = pdfDocumentSchema.parse({
    id: crypto.randomUUID(),
    name: file.name.replace(/\.pdf$/i, ""),
    fileName: file.name,
    size: file.size,
    gameSystem,
    characterIds,
    lastPage: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.transaction("rw", db.pdfDocuments, db.pdfFiles, async () => {
    await db.pdfDocuments.add(document);
    await db.pdfFiles.add({ documentId: document.id, data: file });
  });
  return document;
}

export async function updatePdfDocument(id: string, changes: Partial<Pick<PdfDocument, "name" | "gameSystem" | "characterIds" | "lastPage">>) {
  const current = await db.pdfDocuments.get(id);
  if (!current) throw new Error("PDF not found");
  const updated = pdfDocumentSchema.parse({ ...current, ...changes, updatedAt: now() });
  await db.pdfDocuments.put(updated);
  return updated;
}

export async function addPdfBookmark(documentId: string, page: number, label: string): Promise<PdfBookmark> {
  const bookmark = pdfBookmarkSchema.parse({
    id: crypto.randomUUID(),
    documentId,
    page,
    label: label.trim() || `Page ${page}`,
    createdAt: now(),
  });
  await db.pdfBookmarks.add(bookmark);
  return bookmark;
}

export async function deletePdfBookmark(id: string) {
  await db.pdfBookmarks.delete(id);
}

export async function deletePdf(id: string) {
  await db.transaction("rw", db.pdfDocuments, db.pdfFiles, db.pdfBookmarks, async () => {
    await db.pdfDocuments.delete(id);
    await db.pdfFiles.delete(id);
    await db.pdfBookmarks.where("documentId").equals(id).delete();
  });
}
