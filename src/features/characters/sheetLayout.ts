export const defaultSheetLayoutOrder = [
  "dice",
  "roll-helper",
  "identity",
  "level-preview",
  "roleplay",
  "health-combat",
  "abilities",
  "proficiencies",
  "attacks",
  "training",
  "spells",
  "features",
  "notes",
  "soul-reaper",
  "inventory",
] as const;

export type SheetLayoutSectionId = typeof defaultSheetLayoutOrder[number];
export type SheetLayoutPlacement = "before" | "after";

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
