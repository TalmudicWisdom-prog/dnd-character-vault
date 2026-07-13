export type ContentSourceType = "Canonical" | "Homebrew" | "Custom";

export type ContentSourceDefinition = {
  id: string;
  displayName: string;
  shortLabel: string;
  sourceType: ContentSourceType;
  version: string;
  optional: boolean;
  enabledByDefault: boolean;
  help: string;
};

export const SRD_CONTENT_SOURCE_ID = "srd-5.2.1";
export const FFXIV_CONTENT_SOURCE_ID = "ffxiv-companion-dawntrail";

export const contentSources: ContentSourceDefinition[] = [
  {
    id: SRD_CONTENT_SOURCE_ID,
    displayName: "SRD 5.2.1",
    shortLabel: "SRD",
    sourceType: "Canonical",
    version: "5.2.1",
    optional: false,
    enabledByDefault: true,
    help: "Canonical spell rules included from SRD 5.2.1 under CC BY 4.0.",
  },
  {
    id: FFXIV_CONTENT_SOURCE_ID,
    displayName: "Final Fantasy Companion Guide",
    shortLabel: "FFXIV",
    sourceType: "Homebrew",
    version: "2025-02-18",
    optional: true,
    enabledByDefault: true,
    help: "Optional homebrew content extracted locally from the supplied Final Fantasy companion PDF.",
  },
];

export const optionalContentSources = contentSources.filter((source) => source.optional);
export const defaultEnabledContentSourceIds = contentSources.filter((source) => source.enabledByDefault).map((source) => source.id);

export function contentSource(sourceId: string) {
  return contentSources.find((source) => source.id === sourceId);
}
