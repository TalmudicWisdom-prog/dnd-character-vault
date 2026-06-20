import { describe, expect, it } from "vitest";
import { srdAttribution } from "./srdAttribution";

describe("SRD legal attribution", () => {
  it("includes CC attribution, ownership, and no-endorsement language", () => {
    expect(srdAttribution.text).toContain("System Reference Document 5.2.1");
    expect(srdAttribution.ownership).toContain("Wizards of the Coast LLC");
    expect(srdAttribution.ownership).toContain("CC BY 4.0");
    expect(srdAttribution.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(srdAttribution.noEndorsement).toContain("not affiliated");
    expect(srdAttribution.compatibility).toContain("Non-SRD Player's Handbook content is not bundled");
  });
});
