import { beforeEach, describe, expect, it } from "vitest";
import { FFXIV_CONTENT_SOURCE_ID, SRD_CONTENT_SOURCE_ID } from "../rules/contentSources";
import { db, getSettings, updateSettings } from "./database";

describe("content source preferences", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("persists the Final Fantasy Companion Guide preference across a database reopen", async () => {
    expect((await getSettings()).enabledContentSourceIds).toContain(FFXIV_CONTENT_SOURCE_ID);

    await updateSettings({ enabledContentSourceIds: [SRD_CONTENT_SOURCE_ID] });
    await db.close();
    await db.open();

    expect((await getSettings()).enabledContentSourceIds).toEqual([SRD_CONTENT_SOURCE_ID]);
  });
});
