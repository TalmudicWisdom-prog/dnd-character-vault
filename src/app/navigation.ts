export const pages = [
  { id: "characters", label: "Characters", icon: "C" },
  { id: "library", label: "PDF Library", icon: "P" },
  { id: "storage", label: "Storage", icon: "S" },
  { id: "tools", label: "Vault Tools", icon: "T" },
  { id: "settings", label: "Settings", icon: "G" },
] as const;

export type PageId = (typeof pages)[number]["id"];
