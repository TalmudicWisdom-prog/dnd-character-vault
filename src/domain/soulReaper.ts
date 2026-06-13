import type { SoulReaperPath } from "./models";

export const soulReaperPathLabels: Record<SoulReaperPath, string> = {
  unselected: "Choose at Soul Reaper level 3",
  graveWarden: "Grave Warden",
  soulBinder: "Soul Binder",
  dreadReaper: "Dread Reaper",
  paleRider: "Pale Rider",
  plagueReaper: "Plague Reaper",
};

export const soulReaperPathFeatures: Record<Exclude<SoulReaperPath, "unselected">, Record<number, string>> = {
  graveWarden: { 3: "Bone Armor", 6: "Grave Challenge", 10: "Keeper of the Dead", 14: "Undying Sentinel", 18: "Lord of Graves" },
  soulBinder: { 3: "Bound Servant", 6: "Soul Link", 10: "Soul Fusion", 14: "Master of the Bound Host", 18: "Soul Tyrant" },
  dreadReaper: { 3: "Harvester of Fear", 6: "Aura of Dread", 10: "Execute", 14: "Nightmare Form", 18: "Aspect of Death" },
  paleRider: { 3: "Spectral Mount", 6: "Ghost Step", 10: "Ride Them Down", 14: "Wraith Form", 18: "Harbinger of the Last Ride" },
  plagueReaper: { 3: "Rotting Strike", 6: "Plague Aura", 10: "Spread the Rot", 14: "Body of Decay", 18: "Walking Plague" },
};

export type SoulReaperLevel = {
  level: number;
  proficiency: string;
  features: string[];
  soulDice: string;
  soulsHeld: number | null;
  undead: number | null;
  spellSlots: [number, number, number, number, number];
};

const rows: Array<[string, string[], string, number | null, number | null, [number, number, number, number, number]]> = [
  ["+2", ["Soul Sense", "Reaper's Scythe"], "—", null, null, [0, 0, 0, 0, 0]],
  ["+2", ["Soul Harvest", "Soul Dice", "Spellcasting"], "1d6", 3, null, [2, 0, 0, 0, 0]],
  ["+2", ["Reaper Path"], "1d6", 3, null, [3, 0, 0, 0, 0]],
  ["+2", ["Ability Score Improvement"], "2d6", 4, null, [3, 0, 0, 0, 0]],
  ["+3", ["Command Undead"], "2d6", 4, 1, [4, 2, 0, 0, 0]],
  ["+3", ["Path Feature"], "3d6", 5, 1, [4, 2, 0, 0, 0]],
  ["+3", ["Reaper's Step"], "3d6", 5, 2, [4, 3, 0, 0, 0]],
  ["+3", ["Ability Score Improvement"], "4d6", 6, 2, [4, 3, 0, 0, 0]],
  ["+4", ["Soul Shield", "Soul Dice d8"], "4d8", 6, 2, [4, 3, 2, 0, 0]],
  ["+4", ["Path Feature"], "5d8", 7, 3, [4, 3, 2, 0, 0]],
  ["+4", ["Aura of Death"], "5d8", 7, 3, [4, 3, 3, 0, 0]],
  ["+4", ["Ability Score Improvement"], "6d8", 8, 3, [4, 3, 3, 0, 0]],
  ["+5", ["Raise the Fallen"], "6d8", 8, 4, [4, 3, 3, 1, 0]],
  ["+5", ["Path Feature"], "7d8", 9, 4, [4, 3, 3, 1, 0]],
  ["+5", ["Scythe of Ending", "Soul Dice d10"], "7d10", 9, 4, [4, 3, 3, 2, 0]],
  ["+5", ["Ability Score Improvement"], "8d10", 10, 5, [4, 3, 3, 2, 0]],
  ["+6", ["Reap the Field"], "8d10", 10, 5, [4, 3, 3, 3, 1]],
  ["+6", ["Path Feature"], "9d10", 11, 5, [4, 3, 3, 3, 1]],
  ["+6", ["Ability Score Improvement"], "9d10", 11, 6, [4, 3, 3, 3, 2]],
  ["+6", ["Avatar of Death"], "10d10", 12, 6, [4, 3, 3, 3, 2]],
];

export const soulReaperLevels: SoulReaperLevel[] = rows.map((row, index) => ({
  level: index + 1,
  proficiency: row[0],
  features: row[1],
  soulDice: row[2],
  soulsHeld: row[3],
  undead: row[4],
  spellSlots: row[5],
}));

export function soulReaperFeaturesAtLevel(level: number, path: SoulReaperPath) {
  const row = soulReaperLevels[level - 1];
  const pathFeature = path === "unselected" ? undefined : soulReaperPathFeatures[path][level];
  return pathFeature ? row.features.map((feature) => feature === "Path Feature" || feature === "Reaper Path" ? pathFeature : feature) : row.features;
}
