export const defaultSheetLayoutOrder = [
  "health-combat",
  "roll-helper",
  "attacks",
  "dice",
  "spells",
  "abilities",
  "proficiencies",
  "notes",
  "features",
  "inventory",
  "soul-reaper",
  "identity",
  "level-preview",
  "roleplay",
  "training",
] as const;

export type SheetLayoutSectionId = typeof defaultSheetLayoutOrder[number];
export type SheetLayoutPlacement = "before" | "after";

export function sheetSectionDomId(sectionId: SheetLayoutSectionId) {
  return `sheet-section-${sectionId}`;
}

export const livePlayShortcutSections: { id: SheetLayoutSectionId; label: string; targetId: string }[] = [
  { id: "health-combat", label: "HP", targetId: sheetSectionDomId("health-combat") },
  { id: "roll-helper", label: "Rolls", targetId: sheetSectionDomId("roll-helper") },
  { id: "dice", label: "Dice", targetId: sheetSectionDomId("dice") },
  { id: "attacks", label: "Actions", targetId: sheetSectionDomId("attacks") },
  { id: "spells", label: "Spells", targetId: sheetSectionDomId("spells") },
  { id: "inventory", label: "Gear", targetId: sheetSectionDomId("inventory") },
  { id: "features", label: "Features", targetId: sheetSectionDomId("features") },
  { id: "notes", label: "Notes", targetId: sheetSectionDomId("notes") },
  { id: "roleplay", label: "Bio", targetId: sheetSectionDomId("roleplay") },
];

export const majorGameplayModuleSections: SheetLayoutSectionId[] = [
  "health-combat",
  "roll-helper",
  "dice",
  "attacks",
  "spells",
  "inventory",
  "features",
  "notes",
  "roleplay",
];

const defaultLayoutSet = new Set<string>(defaultSheetLayoutOrder);

export function isSheetLayoutSectionId(value: string): value is SheetLayoutSectionId {
  return defaultLayoutSet.has(value);
}

export function normalizeSheetLayoutOrder(savedOrder: readonly string[] = []) {
  const seen = new Set<string>();
  const savedKnownSections = savedOrder.filter((sectionId): sectionId is SheetLayoutSectionId => {
    if (!isSheetLayoutSectionId(sectionId) || seen.has(sectionId)) return false;
    seen.add(sectionId);
    return true;
  });
  return [
    ...savedKnownSections,
    ...defaultSheetLayoutOrder.filter((sectionId) => !seen.has(sectionId)),
  ];
}

export function reorderSheetLayoutOrder(
  savedOrder: readonly string[],
  activeId: SheetLayoutSectionId,
  targetId: SheetLayoutSectionId,
  placement: SheetLayoutPlacement = "before",
) {
  const order = normalizeSheetLayoutOrder(savedOrder).filter((sectionId) => sectionId !== activeId);
  const targetIndex = order.indexOf(targetId);
  if (targetIndex === -1) return normalizeSheetLayoutOrder(savedOrder);
  const insertAt = placement === "after" ? targetIndex + 1 : targetIndex;
  order.splice(insertAt, 0, activeId);
  return order;
}

export function moveSheetLayoutSection(
  savedOrder: readonly string[],
  sectionId: SheetLayoutSectionId,
  direction: "up" | "down",
) {
  const order = normalizeSheetLayoutOrder(savedOrder);
  const currentIndex = order.indexOf(sectionId);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= order.length) return order;
  const [moved] = order.splice(currentIndex, 1);
  order.splice(nextIndex, 0, moved);
  return order;
}
