import type { ImportMode, ImportSession, ImportSessionFile } from "../domain/import";
import { mergeImportResults } from "../import/merge";
import { db } from "./database";

function now() {
  return new Date().toISOString();
}

export async function createImportSession(mode: ImportMode = "local") {
  const timestamp = now();
  const session: ImportSession = {
    id: crypto.randomUUID(), mode, status: "selecting", fileOrder: [], parseResults: [],
    mergedDraft: null, conflicts: [], createdAt: timestamp, updatedAt: timestamp,
  };
  await db.importSessions.add(session);
  return session;
}

export async function addImportFiles(sessionId: string, files: File[]) {
  const session = await db.importSessions.get(sessionId);
  if (!session) throw new Error("Import session not found");
  const records: ImportSessionFile[] = files.map((file) => ({
    id: crypto.randomUUID(), sessionId, name: file.name, type: file.type || "application/octet-stream",
    size: file.size, lastModified: file.lastModified, pageCount: file.type.startsWith("image/") ? 1 : null, data: file,
  }));
  await db.transaction("rw", db.importSessions, db.importSessionFiles, async () => {
    await db.importSessionFiles.bulkAdd(records);
    await db.importSessions.update(sessionId, { fileOrder: [...session.fileOrder, ...records.map((record) => record.id)], updatedAt: now() });
  });
  return records;
}

export async function updateImportSession(session: ImportSession) {
  const updated = { ...session, updatedAt: now() };
  await db.importSessions.put(updated);
  return updated;
}

export async function removeImportFile(sessionId: string, fileId: string) {
  const session = await db.importSessions.get(sessionId);
  if (!session) return;
  const parseResults = session.parseResults.filter((result) => result.fileId !== fileId);
  const merged = parseResults.length ? mergeImportResults(parseResults) : { mergedDraft: null, conflicts: [] };
  await db.transaction("rw", db.importSessions, db.importSessionFiles, async () => {
    await db.importSessionFiles.delete(fileId);
    await db.importSessions.put({
      ...session, status: parseResults.length ? "review" : "selecting", fileOrder: session.fileOrder.filter((id) => id !== fileId),
      parseResults, ...merged, updatedAt: now(),
    });
  });
}

export async function reorderImportFile(sessionId: string, fileId: string, direction: -1 | 1) {
  const session = await db.importSessions.get(sessionId);
  if (!session) return;
  const index = session.fileOrder.indexOf(fileId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= session.fileOrder.length) return;
  const fileOrder = [...session.fileOrder];
  [fileOrder[index], fileOrder[destination]] = [fileOrder[destination], fileOrder[index]];
  await db.importSessions.update(sessionId, { fileOrder, updatedAt: now() });
}

export async function discardImportSession(sessionId: string) {
  await db.transaction("rw", db.importSessions, db.importSessionFiles, async () => {
    await db.importSessionFiles.where("sessionId").equals(sessionId).delete();
    await db.importSessions.delete(sessionId);
  });
}
