import { beforeEach, describe, expect, it } from "vitest";
import { createVaultBackup, restoreVaultBackup, validateVaultBackup } from "./backups";
import { db } from "./database";
import { createCharacter } from "./characters";

describe("manual backup and restore", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("restores validated records and rejects modified backup payloads", async () => {
    const character = await createCharacter({ name: "Backup Hero", summary: "Local notes", playerName: "", campaign: "", ancestry: "", characterClass: "", level: 3 });
    const backup = await createVaultBackup(false);
    await db.characters.clear();
    await restoreVaultBackup(backup, "new");
    expect((await db.characters.get(character.id))?.summary).toBe("Local notes");

    const tampered = structuredClone(backup);
    tampered.payload.characters[0].name = "Changed";
    await expect(validateVaultBackup(tampered)).rejects.toThrow("checksum");
  });
});
