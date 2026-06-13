import type { SoulReaperProgression } from "../domain/models";
import { soulReaperProgressionSchema } from "../domain/models";
import { db } from "./database";
import { importPdf } from "./pdfs";

function now() {
  return new Date().toISOString();
}

export async function createSoulReaperProgression(characterId: string, level = 1) {
  const progression = soulReaperProgressionSchema.parse({
    characterId,
    level,
    path: "unselected",
    currentSouls: 0,
    sourcePdfId: null,
    notes: "",
    updatedAt: now(),
  });
  await db.soulReaperProgressions.put(progression);
  return progression;
}

export async function saveSoulReaperProgression(progression: SoulReaperProgression) {
  const existing = await db.soulReaperProgressions.get(progression.characterId);
  if (!existing) throw new Error("Soul Reaper progression not found");
  const updated = soulReaperProgressionSchema.parse({ ...progression, updatedAt: now() });
  await db.soulReaperProgressions.put(updated);
  await db.characters.update(updated.characterId, { updatedAt: updated.updatedAt });
  return updated;
}

export async function attachSoulReaperPdf(progression: SoulReaperProgression, file: File) {
  const document = await importPdf(file, "D&D 5e · Soul Reaper", [progression.characterId]);
  return saveSoulReaperProgression({ ...progression, sourcePdfId: document.id });
}

export async function copySoulReaperProgression(sourceCharacterId: string, targetCharacterId: string) {
  const progression = await db.soulReaperProgressions.get(sourceCharacterId);
  if (!progression) return;
  await db.soulReaperProgressions.put({
    ...progression,
    characterId: targetCharacterId,
    sourcePdfId: null,
    updatedAt: now(),
  });
}
