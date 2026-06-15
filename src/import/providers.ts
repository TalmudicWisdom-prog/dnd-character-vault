import type { ImportMode, ImportSessionFile } from "../domain/import";
import { readCharacterSheetSource } from "./readSource";

export type ProviderResult = {
  fileId: string;
  rawText: string;
  pageCount: number | null;
  confidence: number | null;
};

export type ImportProvider = {
  mode: ImportMode;
  label: string;
  available: boolean;
  unavailableReason: string;
  parse(files: ImportSessionFile[], onStatus: (message: string) => void): Promise<ProviderResult[]>;
};

function fileLike(record: ImportSessionFile) {
  return new File([record.data], record.name, { type: record.type, lastModified: record.lastModified });
}

export function getLocalImportProvider(): ImportProvider {
  return {
    mode: "local",
    label: "Local import (private, offline)",
    available: true,
    unavailableReason: "",
    async parse(files, onStatus) {
      const results: ProviderResult[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        onStatus(`Reading ${index + 1} of ${files.length}: ${file.name}`);
        const parsed = await readCharacterSheetSource(fileLike(file), onStatus);
        results.push({ fileId: file.id, ...parsed });
      }
      return results;
    },
  };
}

export function getOnlineImportProvider(): ImportProvider {
  const endpoint = String(import.meta.env.VITE_AI_OCR_ENDPOINT ?? "").trim();
  const online = typeof navigator === "undefined" || navigator.onLine;
  return {
    mode: "online",
    label: "Online AI import (better accuracy, requires internet)",
    available: Boolean(endpoint) && online,
    unavailableReason: !online ? "Internet connection unavailable." : !endpoint ? "No Online AI OCR provider is configured for this app." : "",
    async parse(files, onStatus) {
      if (!endpoint) throw new Error("No Online AI OCR provider is configured");
      if (!navigator.onLine) throw new Error("Internet connection unavailable");
      onStatus("Sending selected files to the configured AI OCR provider...");
      const body = new FormData();
      files.forEach((file) => body.append("files", fileLike(file), file.name));
      const response = await fetch(endpoint, { method: "POST", body });
      if (!response.ok) throw new Error(`Online AI import failed (${response.status})`);
      const value = await response.json() as { documents?: Array<{ fileName: string; rawText: string; confidence?: number; pageCount?: number }> };
      if (!Array.isArray(value.documents)) throw new Error("Online AI provider returned an invalid response");
      return files.map((file) => {
        const document = value.documents!.find((candidate) => candidate.fileName === file.name);
        if (!document?.rawText) throw new Error(`Online AI provider did not return text for ${file.name}`);
        return { fileId: file.id, rawText: document.rawText, confidence: document.confidence ?? null, pageCount: document.pageCount ?? file.pageCount };
      });
    },
  };
}

export function getImportProvider(mode: ImportMode) {
  return mode === "online" ? getOnlineImportProvider() : getLocalImportProvider();
}
