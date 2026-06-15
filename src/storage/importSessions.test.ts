import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./database";
import { addImportFiles, createImportSession, removeImportFile, reorderImportFile } from "./importSessions";

describe("resumable multi-file import sessions", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("stores selected file blobs and preserves manual file order", async () => {
    const session = await createImportSession();
    const records = await addImportFiles(session.id, [
      new File(["first"], "first.png", { type: "image/png", lastModified: 1 }),
      new File(["second"], "second.pdf", { type: "application/pdf", lastModified: 2 }),
    ]);
    await reorderImportFile(session.id, records[1].id, -1);
    const reordered = await db.importSessions.get(session.id);
    expect(reordered?.fileOrder).toEqual([records[1].id, records[0].id]);
    expect((await db.importSessionFiles.get(records[0].id))?.data.size).toBe(5);

    await removeImportFile(session.id, records[1].id);
    expect((await db.importSessions.get(session.id))?.fileOrder).toEqual([records[0].id]);
  });
});
