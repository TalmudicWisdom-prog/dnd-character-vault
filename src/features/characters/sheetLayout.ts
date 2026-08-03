export type CharacterMenuAction =
  | "open-health-combat"
  | "open-armor-class"
  | "open-initiative"
  | "open-conditions"
  | "open-inspiration"
  | "open-vitals"
  | "open-abilities"
  | "open-saving-throws"
  | "open-senses"
  | "open-skills"
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

export type HudModuleCategory = "core" | "combat" | "character" | "reference";
export type HudModuleKind =
  | "identity"
  | "armor-class"
  | "initiative"
  | "health"
  | "conditions"
  | "inspiration"
  | "vitals"
  | "abilities"
  | "saving-throws"
  | "senses"
  | "skills"
  | "optional";

type SheetModuleDefinition = {
  id: string;
  title: string;
  label: string;
  icon: string;
  category: HudModuleCategory;
  homeKind: HudModuleKind;
  availability?: "soul-reaper-attached";
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
  { id: "identity", title: "Character identity", label: "Portrait & Identity", icon: "ID", category: "core", homeKind: "identity", defaultVisible: true, menu: { id: "identity", kind: "action", label: "Character Identity", shortLabel: "Identity", icon: "ID", actionId: "open-identity" } },
  { id: "armor-class", title: "Armor Class", label: "Armor Class", icon: "AC", category: "core", homeKind: "armor-class", defaultVisible: true, menu: { id: "armor-class", kind: "action", label: "Armor Class", shortLabel: "AC", icon: "AC", actionId: "open-armor-class" } },
  { id: "initiative", title: "Initiative", label: "Initiative", icon: "INI", category: "core", homeKind: "initiative", defaultVisible: true, menu: { id: "initiative", kind: "action", label: "Initiative", shortLabel: "Initiative", icon: "INI", actionId: "open-initiative" } },
  { id: "health-combat", title: "Hit Points and recovery", label: "Hit Points / Rest", icon: "HP", category: "core", homeKind: "health", defaultVisible: true, menu: { id: "health-combat", kind: "action", label: "HP / Combat", shortLabel: "Combat", icon: "HP", actionId: "open-health-combat" } },
  { id: "conditions", title: "Conditions", label: "Conditions", icon: "C", category: "combat", homeKind: "conditions", defaultVisible: true, menu: { id: "conditions", kind: "action", label: "Conditions", shortLabel: "Conditions", icon: "C", actionId: "open-conditions" } },
  { id: "inspiration", title: "Heroic Inspiration", label: "Heroic Inspiration", icon: "I", category: "combat", homeKind: "inspiration", defaultVisible: true, menu: { id: "inspiration", kind: "action", label: "Heroic Inspiration", shortLabel: "Inspiration", icon: "I", actionId: "open-inspiration" } },
  { id: "vitals", title: "Speed, Hit Dice, Death Saves", label: "Speed / Hit Dice / Death Saves", icon: "V", category: "combat", homeKind: "vitals", defaultVisible: true, menu: { id: "vitals", kind: "action", label: "Speed, Hit Dice & Death Saves", shortLabel: "Vitals", icon: "V", actionId: "open-vitals" } },
  { id: "abilities", title: "Ability Scores", label: "Ability Scores", icon: "A", category: "core", homeKind: "abilities", defaultVisible: true, menu: { id: "abilities", kind: "action", label: "Ability Scores", shortLabel: "Abilities", icon: "A", actionId: "open-abilities" } },
  { id: "saving-throws", title: "Saving Throws", label: "Saving Throws", icon: "SV", category: "core", homeKind: "saving-throws", defaultVisible: true, menu: { id: "saving-throws", kind: "action", label: "Saving Throws", shortLabel: "Saves", icon: "SV", actionId: "open-saving-throws" } },
  { id: "senses", title: "Senses", label: "Senses", icon: "SE", category: "core", homeKind: "senses", defaultVisible: true, menu: { id: "senses", kind: "action", label: "Senses", shortLabel: "Senses", icon: "SE", actionId: "open-senses" } },
  { id: "skills", title: "Skills", label: "Skills", icon: "SK", category: "character", homeKind: "skills", defaultVisible: false, menu: { id: "skills", kind: "action", label: "Skills", shortLabel: "Skills", icon: "SK", actionId: "open-skills" } },
  { id: "roll-helper", title: "What Do I Roll?", label: "Roll Assistant", icon: "R", category: "reference", homeKind: "optional", defaultVisible: true, menu: { id: "roll-helper", kind: "action", label: "Roll Assistant", shortLabel: "Rolls", icon: "R", actionId: "open-rolls" } },
  { id: "attacks", title: "Attacks and damage", label: "Actions", icon: "A", category: "combat", homeKind: "optional", defaultVisible: true, menu: { id: "attacks", kind: "action", label: "Actions", shortLabel: "Actions", icon: "A", actionId: "open-actions" } },
  { id: "dice", title: "Dice", label: "Dice Roller", icon: "D20", category: "reference", homeKind: "optional", defaultVisible: true, menu: { id: "dice", kind: "action", label: "Dice Roller", shortLabel: "Dice", icon: "D20", actionId: "open-dice" } },
  { id: "spells", title: "Spells", label: "Spellbook", icon: "S", category: "character", homeKind: "optional", defaultVisible: true, menu: { id: "spellbook", kind: "route", label: "Spellbook", shortLabel: "Spells", icon: "S", routeId: "spellbook" } },
  { id: "notes", title: "Character notes", label: "Notes", icon: "N", category: "character", homeKind: "optional", defaultVisible: true, menu: { id: "notes", kind: "action", label: "Notes", shortLabel: "Notes", icon: "N", actionId: "open-notes" } },
  { id: "features", title: "Features and traits", label: "Features & Traits", icon: "F", category: "character", homeKind: "optional", defaultVisible: true, menu: { id: "features", kind: "action", label: "Features & Traits", shortLabel: "Features", icon: "F", actionId: "open-features" } },
  { id: "inventory", title: "Inventory", label: "Inventory", icon: "I", category: "character", homeKind: "optional", defaultVisible: true, menu: { id: "inventory", kind: "action", label: "Inventory", shortLabel: "Inventory", icon: "I", actionId: "open-inventory" } },
  { id: "soul-reaper", title: "Soul Reaper", label: "Soul Reaper", icon: "SR", category: "character", homeKind: "optional", availability: "soul-reaper-attached", defaultVisible: true, menu: { id: "soul-reaper", kind: "action", label: "Soul Reaper", shortLabel: "Soul Reaper", icon: "SR", actionId: "open-soul-reaper" } },
  { id: "level-preview", title: "Next level preview", label: "Next Level", icon: "L+", category: "reference", homeKind: "optional", defaultVisible: true, menu: { id: "level-preview", kind: "action", label: "Next Level Preview", shortLabel: "Next Level", icon: "L+", actionId: "open-level-preview" } },
  { id: "roleplay", title: "Biography", label: "Biography", icon: "B", category: "character", homeKind: "optional", defaultVisible: true, menu: { id: "roleplay", kind: "action", label: "Background / Biography", shortLabel: "Biography", icon: "B", actionId: "open-biography" } },
  { id: "training", title: "Proficiencies and languages", label: "Training", icon: "T", category: "character", homeKind: "optional", defaultVisible: true, menu: { id: "training", kind: "action", label: "Proficiencies & Training", shortLabel: "Training", icon: "T", actionId: "open-training" } },
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
  "open-armor-class": "armor-class",
  "open-initiative": "initiative",
  "open-conditions": "conditions",
  "open-inspiration": "inspiration",
  "open-vitals": "vitals",
  "open-abilities": "abilities",
  "open-saving-throws": "saving-throws",
  "open-senses": "senses",
  "open-skills": "skills",
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
  "identity",
  "health-combat",
  "conditions",
  "abilities",
  "saving-throws",
  "senses",
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

export function hudModuleIsAvailable(sectionId: SheetLayoutSectionId, context: { soulReaperAttached: boolean }) {
  const definition = sheetModuleDefinitions.find((module) => module.id === sectionId);
  return !definition || !("availability" in definition) || definition.availability !== "soul-reaper-attached" || context.soulReaperAttached;
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
