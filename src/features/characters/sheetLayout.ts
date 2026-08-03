export type CharacterMenuAction =
  | "open-health-combat"
  | "open-rolls"
  | "open-dice"
  | "open-actions"
  | "open-inventory"
  | "open-features"
  | "open-training"
  | "open-biography"
  | "open-notes"
  | "open-soul-reaper"
  | "open-identity"
  | "open-level-preview"
  | "open-layout"
  | "open-export"
  | "edit-portrait";

export type CharacterMenuRoute = "spellbook" | "profile" | "pdf-library";

type SheetModuleDefinition = {
  id: string;
  title: string;
  label: string;
  icon: string;
  defaultVisible: boolean;
  menu: {
    id: string;
    label: string;
    shortLabel: string;
    icon: string;
  } & ({ kind: "action"; actionId: CharacterMenuAction } | { kind: "route"; routeId: CharacterMenuRoute });
};

/**
 * The single registry for every reorderable Live HUD module. New modules added
 * here automatically join the default layout, the customizer, and the complete
 * floating command menu.
 */
export const sheetModuleDefinitions = [
  { id: "health-combat", title: "Health and combat", label: "HP / Combat", icon: "HP", defaultVisible: true, menu: { id: "health-combat", kind: "action", label: "HP / Combat", shortLabel: "Combat", icon: "HP", actionId: "open-health-combat" } },
  { id: "roll-helper", title: "What Do I Roll?", label: "Roll Assistant", icon: "R", defaultVisible: true, menu: { id: "roll-helper", kind: "action", label: "Roll Assistant", shortLabel: "Rolls", icon: "R", actionId: "open-rolls" } },
  { id: "attacks", title: "Attacks and damage", label: "Actions", icon: "A", defaultVisible: true, menu: { id: "attacks", kind: "action", label: "Actions", shortLabel: "Actions", icon: "A", actionId: "open-actions" } },
  { id: "dice", title: "Dice", label: "Dice Roller", icon: "D20", defaultVisible: true, menu: { id: "dice", kind: "action", label: "Dice Roller", shortLabel: "Dice", icon: "D20", actionId: "open-dice" } },
  { id: "spells", title: "Spells", label: "Spellbook", icon: "S", defaultVisible: true, menu: { id: "spellbook", kind: "route", label: "Spellbook", shortLabel: "Spells", icon: "S", routeId: "spellbook" } },
  { id: "notes", title: "Character notes", label: "Notes", icon: "N", defaultVisible: true, menu: { id: "notes", kind: "action", label: "Notes", shortLabel: "Notes", icon: "N", actionId: "open-notes" } },
  { id: "features", title: "Features and traits", label: "Features & Traits", icon: "F", defaultVisible: true, menu: { id: "features", kind: "action", label: "Features & Traits", shortLabel: "Features", icon: "F", actionId: "open-features" } },
  { id: "inventory", title: "Inventory", label: "Inventory", icon: "I", defaultVisible: true, menu: { id: "inventory", kind: "action", label: "Inventory", shortLabel: "Inventory", icon: "I", actionId: "open-inventory" } },
  { id: "soul-reaper", title: "Soul Reaper", label: "Soul Reaper", icon: "SR", defaultVisible: true, menu: { id: "soul-reaper", kind: "action", label: "Soul Reaper", shortLabel: "Soul Reaper", icon: "SR", actionId: "open-soul-reaper" } },
  { id: "identity", title: "Character identity", label: "Identity", icon: "ID", defaultVisible: true, menu: { id: "identity", kind: "action", label: "Character Identity", shortLabel: "Identity", icon: "ID", actionId: "open-identity" } },
  { id: "level-preview", title: "Next level preview", label: "Next Level", icon: "L+", defaultVisible: true, menu: { id: "level-preview", kind: "action", label: "Next Level Preview", shortLabel: "Next Level", icon: "L+", actionId: "open-level-preview" } },
  { id: "roleplay", title: "Biography", label: "Biography", icon: "B", defaultVisible: true, menu: { id: "roleplay", kind: "action", label: "Background / Biography", shortLabel: "Biography", icon: "B", actionId: "open-biography" } },
  { id: "training", title: "Proficiencies and languages", label: "Training", icon: "T", defaultVisible: true, menu: { id: "training", kind: "action", label: "Proficiencies & Training", shortLabel: "Training", icon: "T", actionId: "open-training" } },
] as const satisfies readonly SheetModuleDefinition[];

export type SheetLayoutSectionId = typeof sheetModuleDefinitions[number]["id"];
export const defaultSheetLayoutOrder: SheetLayoutSectionId[] = sheetModuleDefinitions.map((module) => module.id);
export const defaultSheetModuleVisibility: Record<SheetLayoutSectionId, boolean> = Object.fromEntries(
  sheetModuleDefinitions.map((module) => [module.id, module.defaultVisible]),
) as Record<SheetLayoutSectionId, boolean>;
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
  "portrait",
] as const;

export type StructuralSheetSectionId = typeof structuralSheetSectionIds[number];
export type SheetNavigatorSectionId = SheetLayoutSectionId | StructuralSheetSectionId;

export function sheetNavigatorDomId(sectionId: SheetNavigatorSectionId) {
  return isSheetLayoutSectionId(sectionId) ? sheetSectionDomId(sectionId) : `sheet-section-${sectionId}`;
}

type CharacterMenuItemBase = {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
};

export type SheetNavigatorSection = CharacterMenuItemBase & {
  id: SheetNavigatorSectionId;
  kind: "section";
  targetId: string;
};

export const characterMenuOverlayTargets: Partial<Record<CharacterMenuAction, SheetNavigatorSectionId>> = {
  "open-health-combat": "health-combat",
  "open-rolls": "roll-helper",
  "open-dice": "dice",
  "open-actions": "attacks",
  "open-inventory": "inventory",
  "open-features": "features",
  "open-training": "training",
  "open-biography": "roleplay",
  "open-notes": "notes",
  "open-soul-reaper": "soul-reaper",
  "open-identity": "identity",
  "open-level-preview": "level-preview",
  "open-layout": "layout",
  "edit-portrait": "portrait",
};

export function characterMenuRouteHash(routeId: CharacterMenuRoute, characterId: string) {
  switch (routeId) {
    case "spellbook": return `#spellbook/${characterId}`;
    case "profile": return `#character/${characterId}`;
    case "pdf-library": return "#library";
  }
}

export type CharacterMenuIntent =
  | { kind: "section"; targetId: string }
  | { kind: "overlay"; targetId: SheetNavigatorSectionId; enableLayoutEditing: boolean }
  | { kind: "route"; hash: string }
  | { kind: "export" };

export type CharacterMenuItem = SheetNavigatorSection | (CharacterMenuItemBase & {
  kind: "action";
  actionId: CharacterMenuAction;
}) | (CharacterMenuItemBase & {
  kind: "route";
  routeId: CharacterMenuRoute;
});

const moduleMenuItems: CharacterMenuItem[] = sheetModuleDefinitions.map((module) => (
  module.menu.kind === "action"
    ? { ...module.menu }
    : { ...module.menu }
));

export const characterMenuItems: CharacterMenuItem[] = [
  { id: "dashboard", kind: "section", label: "Dashboard", shortLabel: "Dashboard", icon: "D", targetId: sheetNavigatorDomId("dashboard") },
  { id: "abilities", kind: "section", label: "Abilities, Saves, Senses", shortLabel: "Abilities", icon: "A", targetId: sheetNavigatorDomId("abilities") },
  { id: "skills", kind: "section", label: "Skills", shortLabel: "Skills", icon: "S", targetId: sheetNavigatorDomId("skills") },
  { id: "speed-defenses", kind: "section", label: "Speed & Defenses", shortLabel: "Defenses", icon: "AC", targetId: sheetNavigatorDomId("speed-defenses") },
  ...moduleMenuItems,
  { id: "pdf-library", kind: "route", label: "PDF Library", shortLabel: "PDF", icon: "P", routeId: "pdf-library" },
  { id: "profile", kind: "route", label: "Profile", shortLabel: "Profile", icon: "ID", routeId: "profile" },
  { id: "export", kind: "action", label: "Export Character", shortLabel: "Export", icon: "E", actionId: "open-export" },
  { id: "layout", kind: "action", label: "Layout Customizer", shortLabel: "Layout", icon: "L", actionId: "open-layout" },
  { id: "edit-portrait", kind: "action", label: "Edit Portrait", shortLabel: "Portrait", icon: "P", actionId: "edit-portrait" },
];

export function characterMenuIntent(item: CharacterMenuItem, characterId: string): CharacterMenuIntent {
  if (item.kind === "section") return { kind: "section", targetId: item.targetId };
  if (item.kind === "route") return { kind: "route", hash: characterMenuRouteHash(item.routeId, characterId) };
  if (item.actionId === "open-export") return { kind: "export" };

  const targetId = characterMenuOverlayTargets[item.actionId];
  if (!targetId) throw new Error(`No destination registered for character menu action: ${item.actionId}`);
  return { kind: "overlay", targetId, enableLayoutEditing: item.actionId === "open-layout" };
}

export const sheetNavigatorSections = characterMenuItems.filter((item): item is SheetNavigatorSection => item.kind === "section");

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

export function normalizeSheetModuleVisibility(savedVisibility: Readonly<Record<string, boolean>> = {}) {
  return Object.fromEntries(sheetModuleDefinitions.map((module) => [
    module.id,
    typeof savedVisibility[module.id] === "boolean" ? savedVisibility[module.id] : module.defaultVisible,
  ])) as Record<SheetLayoutSectionId, boolean>;
}

export function setSheetModuleVisibility(
  savedVisibility: Readonly<Record<string, boolean>>,
  sectionId: SheetLayoutSectionId,
  visible: boolean,
) {
  return { ...savedVisibility, [sectionId]: visible };
}

export function visibleSheetLayoutOrder(
  savedOrder: readonly string[] = [],
  savedVisibility: Readonly<Record<string, boolean>> = {},
) {
  const visibility = normalizeSheetModuleVisibility(savedVisibility);
  return normalizeSheetLayoutOrder(savedOrder).filter((sectionId) => visibility[sectionId]);
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
