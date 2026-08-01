export const defaultSheetLayoutOrder = [
  "health-combat",
  "roll-helper",
  "attacks",
  "dice",
  "spells",
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

const defaultLayoutSet = new Set<string>(defaultSheetLayoutOrder);

export function sheetSectionDomId(sectionId: SheetLayoutSectionId) {
  return `sheet-section-${sectionId}`;
}

export const structuralSheetSectionIds = [
  "dashboard",
  "abilities",
  "skills",
  "speed-defenses",
  "book",
  "layout",
] as const;

export type StructuralSheetSectionId = typeof structuralSheetSectionIds[number];
export type SheetNavigatorSectionId = SheetLayoutSectionId | StructuralSheetSectionId;

export function sheetNavigatorDomId(sectionId: SheetNavigatorSectionId) {
  return isSheetLayoutSectionId(sectionId) ? sheetSectionDomId(sectionId) : `sheet-section-${sectionId}`;
}

export type SheetNavigatorSection = {
  id: SheetNavigatorSectionId;
  label: string;
  shortLabel: string;
  icon: string;
  targetId: string;
};

export const sheetNavigatorSections: SheetNavigatorSection[] = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: "D", targetId: sheetNavigatorDomId("dashboard") },
  { id: "health-combat", label: "HP / Combat", shortLabel: "Combat", icon: "HP", targetId: sheetNavigatorDomId("health-combat") },
  { id: "abilities", label: "Abilities, Saves, Senses", shortLabel: "Abilities", icon: "A", targetId: sheetNavigatorDomId("abilities") },
  { id: "skills", label: "Skills", shortLabel: "Skills", icon: "S", targetId: sheetNavigatorDomId("skills") },
  { id: "speed-defenses", label: "Speed & Defenses", shortLabel: "Defenses", icon: "AC", targetId: sheetNavigatorDomId("speed-defenses") },
  { id: "roll-helper", label: "Rolls", shortLabel: "Rolls", icon: "R", targetId: sheetNavigatorDomId("roll-helper") },
  { id: "dice", label: "Dice", shortLabel: "Dice", icon: "D20", targetId: sheetNavigatorDomId("dice") },
  { id: "attacks", label: "Actions", shortLabel: "Actions", icon: "A", targetId: sheetNavigatorDomId("attacks") },
  { id: "spells", label: "Spells", shortLabel: "Spells", icon: "S", targetId: sheetNavigatorDomId("spells") },
  { id: "inventory", label: "Inventory", shortLabel: "Inventory", icon: "I", targetId: sheetNavigatorDomId("inventory") },
  { id: "features", label: "Features & Traits", shortLabel: "Features", icon: "F", targetId: sheetNavigatorDomId("features") },
  { id: "training", label: "Proficiencies & Training", shortLabel: "Training", icon: "T", targetId: sheetNavigatorDomId("training") },
  { id: "roleplay", label: "Background / Biography", shortLabel: "Biography", icon: "B", targetId: sheetNavigatorDomId("roleplay") },
  { id: "notes", label: "Notes", shortLabel: "Notes", icon: "N", targetId: sheetNavigatorDomId("notes") },
  { id: "book", label: "Book / PDF", shortLabel: "Book", icon: "P", targetId: sheetNavigatorDomId("book") },
  { id: "layout", label: "Layout", shortLabel: "Layout", icon: "L", targetId: sheetNavigatorDomId("layout") },
];

export function sheetNavigatorSectionForTarget(targetId: string) {
  return sheetNavigatorSections.find((section) => section.targetId === targetId) ?? sheetNavigatorSections[0];
}

export function selectSheetNavigatorSection(sectionId: SheetNavigatorSectionId, currentRouteHash: string) {
  const section = sheetNavigatorSections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Error(`Unknown sheet navigator section: ${sectionId}`);
  return { targetId: section.targetId, routeHash: currentRouteHash };
}

export function sheetSectionScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

export type SheetNavigatorModalState = {
  open: boolean;
};

export function openSheetNavigator(state: SheetNavigatorModalState = { open: false }) {
  return { ...state, open: true };
}

export function closeSheetNavigator(state: SheetNavigatorModalState = { open: true }) {
  return { ...state, open: false };
}

export function chooseSheetNavigatorSection(
  state: SheetNavigatorModalState,
  sectionId: SheetNavigatorSectionId,
  currentRouteHash: string,
) {
  return {
    ...selectSheetNavigatorSection(sectionId, currentRouteHash),
    state: closeSheetNavigator(state),
  };
}

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
