import { beforeEach, describe, expect, it } from "vitest";
import { createVaultBackup, restoreVaultBackup, validateVaultBackup } from "./backups";
import { db } from "./database";
import { createCharacter } from "./characters";
import { createSpell, setSpellPinned } from "./spellbooks";

describe("manual backup and restore", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("restores validated records and rejects modified backup payloads", async () => {
    const character = await createCharacter({ name: "Backup Hero", summary: "Local notes", playerName: "", campaign: "", ancestry: "", characterClass: "", level: 3 });
    const spell = await createSpell(character.id, "Backup Ward");
    await setSpellPinned(character.id, spell.id, true);
    const backup = await createVaultBackup(false);
    await db.characters.clear();
    await restoreVaultBackup(backup, "new");
    expect((await db.characters.get(character.id))?.summary).toBe("Local notes");
    expect((await db.spellbooks.get(character.id))?.pinnedSpellIds).toEqual([spell.id]);
    expect((await db.spells.get(spell.id))?.name).toBe("Backup Ward");

    const tampered = structuredClone(backup);
    tampered.payload.characters[0].name = "Changed";
    await expect(validateVaultBackup(tampered)).rejects.toThrow("checksum");
  });

  it("upgrades version 1 backups with an empty spellbook collection", async () => {
    const backup = await createVaultBackup(false);
    const legacyPayload = structuredClone(backup.payload) as Partial<typeof backup.payload>;
    delete legacyPayload.spellbooks;
    delete legacyPayload.spells;
    const bytes = new TextEncoder().encode(JSON.stringify(legacyPayload));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const upgraded = await validateVaultBackup({ ...backup, formatVersion: 1, payload: legacyPayload, checksum });
    expect(upgraded.formatVersion).toBe(2);
    expect(upgraded.payload.spells).toEqual([]);
  });
});
