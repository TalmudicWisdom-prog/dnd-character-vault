import { z } from "zod";
import {
  characterSchema,
  characterSheetSchema,
  inventoryContainerSchema,
  inventoryItemSchema,
  pdfBookmarkSchema,
  pdfDocumentSchema,
  settingsSchema,
  soulReaperProgressionSchema,
  type PdfFile,
} from "../domain/models";
import { db } from "./database";

export const BACKUP_FORMAT_VERSION = 1;
export const APP_VERSION = "0.7.0";
export type RestoreMode = "new" | "merge-skip" | "merge-replace";

const backupPayloadSchema = z.object({
  characters: z.array(characterSchema),
  characterSheets: z.array(characterSheetSchema),
  inventoryContainers: z.array(inventoryContainerSchema),
  inventoryItems: z.array(inventoryItemSchema),
  soulReaperProgressions: z.array(soulReaperProgressionSchema),
  pdfDocuments: z.array(pdfDocumentSchema),
  pdfBookmarks: z.array(pdfBookmarkSchema),
  settings: z.array(settingsSchema),
  pdfFiles: z.array(z.object({
    documentId: z.string().uuid(),
    type: z.string(),
    dataBase64: z.string(),
  })),
});

const vaultBackupSchema = z.object({
  format: z.literal("dnd-character-vault-backup"),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  appVersion: z.string(),
  createdAt: z.string().datetime(),
  includesPdfs: z.boolean(),
  checksum: z.string(),
  payload: backupPayloadSchema,
});

export type VaultBackup = z.infer<typeof vaultBackupSchema>;

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    value += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(value);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function checksumPayload(payload: z.infer<typeof backupPayloadSchema>) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createVaultBackup(includePdfs: boolean): Promise<VaultBackup> {
  const pdfFiles = includePdfs
    ? await Promise.all((await db.pdfFiles.toArray()).map(async (file) => ({
        documentId: file.documentId,
        type: file.data.type || "application/pdf",
        dataBase64: bytesToBase64(new Uint8Array(await file.data.arrayBuffer())),
      })))
    : [];
  const payload = backupPayloadSchema.parse({
    characters: await db.characters.toArray(),
    characterSheets: await db.characterSheets.toArray(),
    inventoryContainers: await db.inventoryContainers.toArray(),
    inventoryItems: await db.inventoryItems.toArray(),
    soulReaperProgressions: await db.soulReaperProgressions.toArray(),
    pdfDocuments: await db.pdfDocuments.toArray(),
    pdfBookmarks: await db.pdfBookmarks.toArray(),
    settings: await db.settings.toArray(),
    pdfFiles,
  });
  return vaultBackupSchema.parse({
    format: "dnd-character-vault-backup",
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    includesPdfs: includePdfs,
    checksum: await checksumPayload(payload),
    payload,
  });
}

export async function validateVaultBackup(value: unknown) {
  const backup = vaultBackupSchema.parse(value);
  if (backup.checksum !== await checksumPayload(backup.payload)) throw new Error("Backup checksum does not match");

  const characterIds = new Set(backup.payload.characters.map((record) => record.id));
  const containerIds = new Set(backup.payload.inventoryContainers.map((record) => record.id));
  const documentIds = new Set(backup.payload.pdfDocuments.map((record) => record.id));
  if (backup.payload.characterSheets.some((record) => !characterIds.has(record.characterId))) throw new Error("Backup contains an unowned character sheet");
  if (backup.payload.inventoryContainers.some((record) => !characterIds.has(record.characterId))) throw new Error("Backup contains an unowned inventory container");
  if (backup.payload.inventoryItems.some((record) => !characterIds.has(record.characterId) || !containerIds.has(record.containerId))) throw new Error("Backup contains an unowned inventory item");
  if (backup.payload.soulReaperProgressions.some((record) => !characterIds.has(record.characterId))) throw new Error("Backup contains unowned custom class data");
  if (backup.payload.pdfDocuments.some((record) => record.characterIds.some((id) => !characterIds.has(id)))) throw new Error("Backup contains an invalid PDF association");
  if (backup.payload.pdfBookmarks.some((record) => !documentIds.has(record.documentId))) throw new Error("Backup contains an orphaned PDF bookmark");
  if (backup.payload.pdfFiles.some((record) => !documentIds.has(record.documentId))) throw new Error("Backup contains an orphaned PDF file");
  return backup;
}

async function putByMode<T>(table: { get(key: string): Promise<unknown>; put(value: T): Promise<unknown> }, records: T[], keyOf: (record: T) => string, replace: boolean) {
  for (const record of records) {
    if (!replace && await table.get(keyOf(record))) continue;
    await table.put(record);
  }
}

export async function restoreVaultBackup(backup: VaultBackup, mode: RestoreMode) {
  const validated = await validateVaultBackup(backup);
  const replace = mode !== "merge-skip";
  const tables = [db.characters, db.characterSheets, db.inventoryContainers, db.inventoryItems, db.soulReaperProgressions, db.pdfDocuments, db.pdfFiles, db.pdfBookmarks, db.settings];
  await db.transaction("rw", tables, async () => {
    if (mode === "new") {
      await Promise.all(tables.map((table) => table.clear()));
    }
    await putByMode(db.characters, validated.payload.characters, (record) => record.id!, replace);
    await putByMode(db.characterSheets, validated.payload.characterSheets, (record) => record.characterId!, replace);
    await putByMode(db.inventoryContainers, validated.payload.inventoryContainers, (record) => record.id!, replace);
    await putByMode(db.inventoryItems, validated.payload.inventoryItems, (record) => record.id!, replace);
    await putByMode(db.soulReaperProgressions, validated.payload.soulReaperProgressions, (record) => record.characterId!, replace);
    await putByMode(db.pdfDocuments, validated.payload.pdfDocuments, (record) => record.id!, replace);
    await putByMode(db.pdfBookmarks, validated.payload.pdfBookmarks, (record) => record.id!, replace);
    await putByMode(db.settings, validated.payload.settings, (record) => record.id!, replace);
    const files: PdfFile[] = validated.payload.pdfFiles.map((record) => ({
      documentId: record.documentId,
      data: new Blob([base64ToBytes(record.dataBase64)], { type: record.type }),
    }));
    await putByMode(db.pdfFiles, files, (record) => record.documentId!, replace);
  });
}

export function downloadBackup(backup: VaultBackup) {
  const fileName = `character-vault-${backup.includesPdfs ? "full" : "light"}-${backup.createdAt.slice(0, 10)}.json`;
  const file = new File([JSON.stringify(backup)], fileName, { type: "application/json" });
  const shareData = { files: [file], title: "D&D Character Vault Backup" };
  if (navigator.share && navigator.canShare?.(shareData)) return navigator.share(shareData);
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return Promise.resolve();
}
