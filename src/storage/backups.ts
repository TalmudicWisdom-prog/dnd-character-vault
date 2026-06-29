import { z } from "zod";
import {
  characterSchema,
  characterSheetSchema,
  characterCreationDraftSchema,
  inventoryContainerSchema,
  inventoryItemSchema,
  pdfBookmarkSchema,
  pdfDocumentSchema,
  settingsSchema,
  soulReaperProgressionSchema,
  spellbookSchema,
  spellSchema,
  type PdfFile,
} from "../domain/models";
import { db } from "./database";

export const BACKUP_FORMAT_VERSION = 3;
export const APP_VERSION = "1.0.0";
export type RestoreMode = "new" | "merge-skip" | "merge-replace";

const backupPayloadSchema = z.object({
  characters: z.array(characterSchema),
  characterSheets: z.array(characterSheetSchema),
  characterCreationDrafts: z.array(characterCreationDraftSchema),
  inventoryContainers: z.array(inventoryContainerSchema),
  inventoryItems: z.array(inventoryItemSchema),
  spellbooks: z.array(spellbookSchema),
  spells: z.array(spellSchema),
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

const versionOneBackupPayloadSchema = backupPayloadSchema.omit({ spellbooks: true, spells: true, characterCreationDrafts: true });
const versionTwoBackupPayloadSchema = backupPayloadSchema.omit({ characterCreationDrafts: true });
const backupEnvelopeSchema = z.object({
  format: z.literal("dnd-character-vault-backup"),
  formatVersion: z.union([z.literal(1), z.literal(2), z.literal(BACKUP_FORMAT_VERSION)]),
  appVersion: z.string(),
  createdAt: z.string().datetime(),
  includesPdfs: z.boolean(),
  checksum: z.string(),
  payload: z.unknown(),
});

export type VaultBackup = z.infer<typeof vaultBackupSchema>;
export type BackupDownloadKind = "all" | "full" | "character";
export type BackupDownloadSummary = {
  fileName: string;
  fileSize: number;
  fileSizeLabel: string;
  charactersBackedUp: number;
  deliveryMethod: "shared" | "downloaded" | "opened";
  timeLabel: string;
};

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

async function checksumPayload(payload: unknown) {
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
    characterCreationDrafts: await db.characterCreationDrafts.toArray(),
    inventoryContainers: await db.inventoryContainers.toArray(),
    inventoryItems: await db.inventoryItems.toArray(),
    spellbooks: await db.spellbooks.toArray(),
    spells: await db.spells.toArray(),
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

export async function createCharacterBackup(characterId: string): Promise<VaultBackup> {
  const [
    character,
    characterSheet,
    inventoryContainers,
    inventoryItems,
    spellbook,
    spells,
    soulReaperProgression,
    pdfDocuments,
    settings,
  ] = await Promise.all([
    db.characters.get(characterId),
    db.characterSheets.get(characterId),
    db.inventoryContainers.where("characterId").equals(characterId).toArray(),
    db.inventoryItems.where("characterId").equals(characterId).toArray(),
    db.spellbooks.get(characterId),
    db.spells.where("characterId").equals(characterId).toArray(),
    db.soulReaperProgressions.get(characterId),
    db.pdfDocuments.filter((document) => document.characterIds.includes(characterId)).toArray(),
    db.settings.toArray(),
  ]);
  if (!character) throw new Error("Character not found");
  const scopedPdfDocuments = pdfDocuments.map((document) => ({ ...document, characterIds: [characterId] }));
  const documentIds = new Set(scopedPdfDocuments.map((document) => document.id));
  const payload = backupPayloadSchema.parse({
    characters: [character],
    characterSheets: characterSheet ? [characterSheet] : [],
    characterCreationDrafts: [],
    inventoryContainers,
    inventoryItems,
    spellbooks: spellbook ? [spellbook] : [],
    spells,
    soulReaperProgressions: soulReaperProgression ? [soulReaperProgression] : [],
    pdfDocuments: scopedPdfDocuments,
    pdfBookmarks: await db.pdfBookmarks.filter((bookmark) => documentIds.has(bookmark.documentId)).toArray(),
    settings,
    pdfFiles: [],
  });
  return vaultBackupSchema.parse({
    format: "dnd-character-vault-backup",
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    includesPdfs: false,
    checksum: await checksumPayload(payload),
    payload,
  });
}

export async function validateVaultBackup(value: unknown) {
  const envelope = backupEnvelopeSchema.parse(value);
  if (envelope.checksum !== await checksumPayload(envelope.payload)) throw new Error("Backup checksum does not match");
  const payload = envelope.formatVersion === 1
    ? backupPayloadSchema.parse({ ...versionOneBackupPayloadSchema.parse(envelope.payload), spellbooks: [], spells: [], characterCreationDrafts: [] })
    : envelope.formatVersion === 2
      ? backupPayloadSchema.parse({ ...versionTwoBackupPayloadSchema.parse(envelope.payload), characterCreationDrafts: [] })
      : backupPayloadSchema.parse(envelope.payload);
  const backup = vaultBackupSchema.parse({
    ...envelope,
    formatVersion: BACKUP_FORMAT_VERSION,
    checksum: await checksumPayload(payload),
    payload,
  });

  const characterIds = new Set(backup.payload.characters.map((record) => record.id));
  const containerIds = new Set(backup.payload.inventoryContainers.map((record) => record.id));
  const documentIds = new Set(backup.payload.pdfDocuments.map((record) => record.id));
  const spellsById = new Map(backup.payload.spells.map((record) => [record.id, record]));
  if (backup.payload.characterSheets.some((record) => !characterIds.has(record.characterId))) throw new Error("Backup contains an unowned character sheet");
  if (backup.payload.inventoryContainers.some((record) => !characterIds.has(record.characterId))) throw new Error("Backup contains an unowned inventory container");
  if (backup.payload.inventoryItems.some((record) => !characterIds.has(record.characterId) || !containerIds.has(record.containerId))) throw new Error("Backup contains an unowned inventory item");
  if (backup.payload.spellbooks.some((record) => !characterIds.has(record.characterId) || record.pinnedSpellIds.some((id) => spellsById.get(id)?.characterId !== record.characterId))) throw new Error("Backup contains an invalid spellbook");
  if (backup.payload.spells.some((record) => !characterIds.has(record.characterId))) throw new Error("Backup contains an unowned spell");
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
  const tables = [db.characters, db.characterSheets, db.characterCreationDrafts, db.inventoryContainers, db.inventoryItems, db.spellbooks, db.spells, db.soulReaperProgressions, db.pdfDocuments, db.pdfFiles, db.pdfBookmarks, db.settings];
  await db.transaction("rw", tables, async () => {
    if (mode === "new") {
      await Promise.all(tables.map((table) => table.clear()));
    }
    await putByMode(db.characters, validated.payload.characters, (record) => record.id!, replace);
    await putByMode(db.characterSheets, validated.payload.characterSheets, (record) => record.characterId!, replace);
    await putByMode(db.characterCreationDrafts, validated.payload.characterCreationDrafts, (record) => record.id!, replace);
    await putByMode(db.inventoryContainers, validated.payload.inventoryContainers, (record) => record.id!, replace);
    await putByMode(db.inventoryItems, validated.payload.inventoryItems, (record) => record.id!, replace);
    await putByMode(db.spellbooks, validated.payload.spellbooks, (record) => record.characterId!, replace);
    await putByMode(db.spells, validated.payload.spells, (record) => record.id!, replace);
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

function safeFileName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vault";
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function backupFileName(backup: VaultBackup, kind: BackupDownloadKind) {
  const namePart = kind === "character" ? safeFileName(backup.payload.characters[0]?.name ?? "character") : kind === "full" ? "everything-with-pdfs" : "all-characters";
  return `character-vault-${namePart}-${backup.createdAt.slice(0, 10)}.json`;
}

function backupJson(backup: VaultBackup) {
  return JSON.stringify(backup);
}

function backupFile(json: string, fileName: string, type = "application/json") {
  return new File([json], fileName, { type });
}

async function shareBackupFile(json: string, fileName: string) {
  if (!navigator.share || !navigator.canShare) return false;

  const title = "D&D Character Vault Backup";
  const candidates = [
    backupFile(json, fileName, "application/json"),
    backupFile(json, fileName, "text/plain"),
  ];

  for (const file of candidates) {
    const shareData = { files: [file], title };
    try {
      if (!navigator.canShare(shareData)) continue;
    } catch {
      continue;
    }
    await navigator.share(shareData);
    return true;
  }
  return false;
}

function downloadBackupFile(json: string, fileName: string): "downloaded" | "opened" {
  const file = backupFile(json, fileName, "application/json;charset=utf-8");
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);

  const supportsDownload = "download" in (link as HTMLElement);
  if (supportsDownload) {
    link.click();
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
    return "downloaded";
  }

  link.remove();
  const opened = window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (opened) return "opened";
  throw new Error("This browser could not start a download. Use Share if available, or try from Safari.");
}

export async function downloadBackup(backup: VaultBackup, kind: BackupDownloadKind = backup.includesPdfs ? "full" : "all"): Promise<BackupDownloadSummary> {
  const fileName = backupFileName(backup, kind);
  const json = backupJson(backup);
  const file = backupFile(json, fileName);
  const shared = await shareBackupFile(json, fileName);
  const deliveryMethod = shared ? "shared" : downloadBackupFile(json, fileName);
  return {
    fileName,
    fileSize: file.size,
    fileSizeLabel: fileSizeLabel(file.size),
    charactersBackedUp: backup.payload.characters.length,
    deliveryMethod,
    timeLabel: new Date(backup.createdAt).toLocaleString(),
  };
}
