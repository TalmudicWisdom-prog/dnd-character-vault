import type { AbilityId, RulesSource, SkillId, SpellActionType } from "../domain/models";

export const srdRulesSource: RulesSource = "SRD";

export type SrdAbility = {
  id: AbilityId;
  label: string;
  shortLabel: string;
  description: string;
  source: RulesSource;
};

export type SrdSkill = {
  id: SkillId;
  label: string;
  ability: AbilityId;
  description: string;
  source: RulesSource;
};

export type SrdClass = {
  name: string;
  primaryAbilities: AbilityId[];
  description: string;
  complexity: "Low" | "Medium" | "High";
  savingThrows: AbilityId[];
  skillChoiceCount: number;
  hitDie: number;
  features?: string[];
  armorProficiencies?: string[];
  weaponProficiencies?: string[];
  toolProficiencies?: string[];
  languages?: string[];
  specialAbilities?: string[];
  spellcastingAbility?: AbilityId;
  spellcastingKind?: "prepared" | "known" | "pact";
  cantripsKnownByLevel?: Record<number, number>;
  startingEquipment?: SrdEquipmentChoiceGroup[];
  source: RulesSource;
};

export type SrdEquipmentItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  source: RulesSource;
};

export type SrdEquipmentChoiceGroup = {
  id: string;
  label: string;
  choose: number;
  options: string[];
};

export type SrdSpell = {
  id: string;
  name: string;
  level: number;
  school: string;
  classes: string[];
  castingTime: string;
  range: string;
  components: string[];
  materialDetails: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
  source: RulesSource;
};

export type SrdNamedOption = {
  name: string;
  description: string;
  speed?: number;
  size?: string;
  traits?: string[];
  languages?: string[];
  skills?: SkillId[];
  tools?: string[];
  feat?: string;
  backgroundFeature?: string;
  armorProficiencies?: string[];
  weaponProficiencies?: string[];
  toolProficiencies?: string[];
  specialAbilities?: string[];
  abilitySuggestions?: AbilityId[];
  source: RulesSource;
};

export const srdAbilities: SrdAbility[] = [
  { id: "str", label: "Strength", shortLabel: "STR", description: "Physical power, lifting, jumping, climbing, and forceful athletic effort.", source: srdRulesSource },
  { id: "dex", label: "Dexterity", shortLabel: "DEX", description: "Agility, balance, reflexes, stealth, and precise hand movement.", source: srdRulesSource },
  { id: "con", label: "Constitution", shortLabel: "CON", description: "Endurance, toughness, stamina, and resisting bodily strain.", source: srdRulesSource },
  { id: "int", label: "Intelligence", shortLabel: "INT", description: "Reasoning, memory, investigation, lore, and studied knowledge.", source: srdRulesSource },
  { id: "wis", label: "Wisdom", shortLabel: "WIS", description: "Awareness, intuition, insight, medicine, survival, and perception.", source: srdRulesSource },
  { id: "cha", label: "Charisma", shortLabel: "CHA", description: "Presence, confidence, social force, deception, persuasion, and performance.", source: srdRulesSource },
];

export const srdSkills: SrdSkill[] = [
  { id: "acrobatics", label: "Acrobatics", ability: "dex", description: "Balance, flips, slips, and agile movement.", source: srdRulesSource },
  { id: "animalHandling", label: "Animal Handling", ability: "wis", description: "Calming, controlling, or understanding animals.", source: srdRulesSource },
  { id: "arcana", label: "Arcana", ability: "int", description: "Magic lore, spells, planes, symbols, and magical traditions.", source: srdRulesSource },
  { id: "athletics", label: "Athletics", ability: "str", description: "Climbing, jumping, swimming, grappling, and forceful movement.", source: srdRulesSource },
  { id: "deception", label: "Deception", ability: "cha", description: "Lying, disguising intent, and misleading others.", source: srdRulesSource },
  { id: "history", label: "History", ability: "int", description: "Historic events, cultures, people, wars, and old lore.", source: srdRulesSource },
  { id: "insight", label: "Insight", ability: "wis", description: "Reading motives, moods, lies, and intentions.", source: srdRulesSource },
  { id: "intimidation", label: "Intimidation", ability: "cha", description: "Influencing through threats, pressure, or commanding presence.", source: srdRulesSource },
  { id: "investigation", label: "Investigation", ability: "int", description: "Finding clues and making deductions from details.", source: srdRulesSource },
  { id: "medicine", label: "Medicine", ability: "wis", description: "Stabilizing creatures, recognizing illness, and practical care.", source: srdRulesSource },
  { id: "nature", label: "Nature", ability: "int", description: "Terrain, plants, animals, weather, and natural cycles.", source: srdRulesSource },
  { id: "perception", label: "Perception", ability: "wis", description: "Noticing hidden, distant, subtle, or sudden things.", source: srdRulesSource },
  { id: "performance", label: "Performance", ability: "cha", description: "Entertaining or moving an audience.", source: srdRulesSource },
  { id: "persuasion", label: "Persuasion", ability: "cha", description: "Convincing others with honesty, tact, or charm.", source: srdRulesSource },
  { id: "religion", label: "Religion", ability: "int", description: "Deities, rites, holy symbols, cults, and religious lore.", source: srdRulesSource },
  { id: "sleightOfHand", label: "Sleight of Hand", ability: "dex", description: "Pickpocketing, palming objects, and manual trickery.", source: srdRulesSource },
  { id: "stealth", label: "Stealth", ability: "dex", description: "Hiding, moving quietly, and avoiding notice.", source: srdRulesSource },
  { id: "survival", label: "Survival", ability: "wis", description: "Tracking, foraging, navigation, and wilderness hazards.", source: srdRulesSource },
];

export const srdCoreTerms = [
  { name: "d20 Test", description: "A d20 roll used for an ability check, attack roll, or saving throw.", source: srdRulesSource },
  { name: "Ability Check", description: "A d20 roll to see whether a creature succeeds at a task using an ability.", source: srdRulesSource },
  { name: "Attack Roll", description: "A d20 roll to see whether an attack hits a target.", source: srdRulesSource },
  { name: "Saving Throw", description: "A d20 roll to resist or avoid a harmful effect.", source: srdRulesSource },
  { name: "Proficiency Bonus", description: "A level-based bonus added when a character is proficient.", source: srdRulesSource },
  { name: "Advantage", description: "Roll two d20s and use the higher result.", source: srdRulesSource },
  { name: "Disadvantage", description: "Roll two d20s and use the lower result.", source: srdRulesSource },
];

export const srdProficiencyBonusByLevel = Array.from({ length: 20 }, (_, index) => {
  const level = index + 1;
  return { level, bonus: Math.ceil(level / 4) + 1, source: srdRulesSource };
});

export const srdEquipment: SrdEquipmentItem[] = [
  { id: "battleaxe", name: "Battleaxe", category: "Weapon", description: "A martial melee weapon.", source: srdRulesSource },
  { id: "chain-mail", name: "Chain Mail", category: "Armor", description: "Heavy armor.", source: srdRulesSource },
  { id: "dagger", name: "Dagger", category: "Weapon", description: "A light simple weapon.", source: srdRulesSource },
  { id: "explorers-pack", name: "Explorer's Pack", category: "Adventuring Gear", description: "Travel gear for wilderness and dungeon exploration.", source: srdRulesSource },
  { id: "leather-armor", name: "Leather Armor", category: "Armor", description: "Light armor.", source: srdRulesSource },
  { id: "longbow", name: "Longbow", category: "Weapon", description: "A martial ranged weapon.", source: srdRulesSource },
  { id: "longsword", name: "Longsword", category: "Weapon", description: "A martial melee weapon.", source: srdRulesSource },
  { id: "mace", name: "Mace", category: "Weapon", description: "A simple melee weapon.", source: srdRulesSource },
  { id: "martial-weapon", name: "Martial Weapon", category: "Weapon", description: "Choose a martial weapon allowed by your table.", source: srdRulesSource },
  { id: "musical-instrument", name: "Musical Instrument", category: "Tool", description: "Choose one musical instrument.", source: srdRulesSource },
  { id: "priest-pack", name: "Priest's Pack", category: "Adventuring Gear", description: "Gear for religious travel and rites.", source: srdRulesSource },
  { id: "quarterstaff", name: "Quarterstaff", category: "Weapon", description: "A simple melee weapon.", source: srdRulesSource },
  { id: "rapier", name: "Rapier", category: "Weapon", description: "A finesse martial melee weapon.", source: srdRulesSource },
  { id: "scholars-pack", name: "Scholar's Pack", category: "Adventuring Gear", description: "Gear for study, writing, and research.", source: srdRulesSource },
  { id: "shield", name: "Shield", category: "Armor", description: "Held protection that can improve Armor Class.", source: srdRulesSource },
  { id: "shortbow", name: "Shortbow", category: "Weapon", description: "A simple ranged weapon.", source: srdRulesSource },
  { id: "shortsword", name: "Shortsword", category: "Weapon", description: "A light finesse martial melee weapon.", source: srdRulesSource },
  { id: "simple-weapon", name: "Simple Weapon", category: "Weapon", description: "Choose a simple weapon allowed by your table.", source: srdRulesSource },
  { id: "spellbook", name: "Spellbook", category: "Adventuring Gear", description: "A book used to record wizard spells.", source: srdRulesSource },
  { id: "thieves-tools", name: "Thieves' Tools", category: "Tool", description: "Tools for locks and traps.", source: srdRulesSource },
  { id: "wooden-shield", name: "Wooden Shield", category: "Armor", description: "A shield made primarily of wood.", source: srdRulesSource },
];

function equipmentChoices(classId: string, groups: Array<Omit<SrdEquipmentChoiceGroup, "id">>): SrdEquipmentChoiceGroup[] {
  return groups.map((group, index) => ({ ...group, id: `${classId}-equipment-${index + 1}` }));
}

export const srdClasses: SrdClass[] = [
  { name: "Barbarian", primaryAbilities: ["str"], complexity: "Low", savingThrows: ["str", "con"], skillChoiceCount: 2, hitDie: 12, startingEquipment: equipmentChoices("barbarian", [{ label: "Choose a main weapon", choose: 1, options: ["battleaxe", "martial-weapon"] }, { label: "Choose travel gear", choose: 1, options: ["explorers-pack"] }]), description: "A fierce warrior who relies on rage, toughness, and physical power.", source: srdRulesSource },
  { name: "Bard", primaryAbilities: ["cha"], complexity: "High", savingThrows: ["dex", "cha"], skillChoiceCount: 3, hitDie: 8, spellcastingAbility: "cha", spellcastingKind: "known", cantripsKnownByLevel: { 1: 2 }, startingEquipment: equipmentChoices("bard", [{ label: "Choose a weapon", choose: 1, options: ["rapier", "longsword", "simple-weapon"] }, { label: "Choose performance gear", choose: 1, options: ["musical-instrument"] }]), description: "A performer and spellcaster who inspires allies and solves problems with skill.", source: srdRulesSource },
  { name: "Cleric", primaryAbilities: ["wis"], complexity: "Medium", savingThrows: ["wis", "cha"], skillChoiceCount: 2, hitDie: 8, spellcastingAbility: "wis", spellcastingKind: "prepared", cantripsKnownByLevel: { 1: 3 }, startingEquipment: equipmentChoices("cleric", [{ label: "Choose a weapon", choose: 1, options: ["mace", "simple-weapon"] }, { label: "Choose protection", choose: 1, options: ["chain-mail", "leather-armor"] }, { label: "Choose a pack", choose: 1, options: ["priest-pack", "explorers-pack"] }]), description: "A divine spellcaster shaped by faith, healing, protection, and sacred power.", source: srdRulesSource },
  { name: "Druid", primaryAbilities: ["wis"], complexity: "High", savingThrows: ["int", "wis"], skillChoiceCount: 2, hitDie: 8, features: ["Druidic", "Spellcasting"], armorProficiencies: ["Light Armor", "Medium Armor", "Shields"], weaponProficiencies: ["Clubs", "Daggers", "Darts", "Javelins", "Maces", "Quarterstaffs", "Scimitars", "Sickles", "Slings", "Spears"], toolProficiencies: ["Herbalism Kit"], languages: ["Druidic"], spellcastingAbility: "wis", spellcastingKind: "prepared", cantripsKnownByLevel: { 1: 2 }, startingEquipment: equipmentChoices("druid", [{ label: "Choose protection or a weapon", choose: 1, options: ["wooden-shield", "simple-weapon"] }, { label: "Choose a weapon", choose: 1, options: ["quarterstaff", "simple-weapon"] }, { label: "Choose a pack", choose: 1, options: ["explorers-pack", "scholars-pack"] }]), description: "A nature-focused spellcaster connected to beasts, terrain, and primal magic.", source: srdRulesSource },
  { name: "Fighter", primaryAbilities: ["str", "dex"], complexity: "Low", savingThrows: ["str", "con"], skillChoiceCount: 2, hitDie: 10, startingEquipment: equipmentChoices("fighter", [{ label: "Choose armor", choose: 1, options: ["chain-mail", "leather-armor"] }, { label: "Choose a weapon", choose: 1, options: ["martial-weapon", "longbow"] }, { label: "Choose a pack", choose: 1, options: ["explorers-pack"] }]), description: "A flexible weapon expert built around martial training and reliable combat.", source: srdRulesSource },
  { name: "Monk", primaryAbilities: ["dex", "wis"], complexity: "Medium", savingThrows: ["str", "dex"], skillChoiceCount: 2, hitDie: 8, startingEquipment: equipmentChoices("monk", [{ label: "Choose a weapon", choose: 1, options: ["shortsword", "simple-weapon"] }, { label: "Choose travel gear", choose: 1, options: ["explorers-pack"] }]), description: "A disciplined martial artist who uses speed, focus, and precise strikes.", source: srdRulesSource },
  { name: "Paladin", primaryAbilities: ["str", "cha"], complexity: "Medium", savingThrows: ["wis", "cha"], skillChoiceCount: 2, hitDie: 10, spellcastingAbility: "cha", spellcastingKind: "prepared", startingEquipment: equipmentChoices("paladin", [{ label: "Choose a weapon", choose: 1, options: ["martial-weapon", "shield"] }, { label: "Choose a pack", choose: 1, options: ["priest-pack", "explorers-pack"] }]), description: "An oath-bound warrior with protective magic, healing, and powerful strikes.", source: srdRulesSource },
  { name: "Ranger", primaryAbilities: ["dex", "wis"], complexity: "Medium", savingThrows: ["str", "dex"], skillChoiceCount: 3, hitDie: 10, spellcastingAbility: "wis", spellcastingKind: "known", startingEquipment: equipmentChoices("ranger", [{ label: "Choose armor", choose: 1, options: ["leather-armor"] }, { label: "Choose a weapon", choose: 1, options: ["shortsword", "simple-weapon"] }, { label: "Choose a pack", choose: 1, options: ["explorers-pack"] }]), description: "A skilled explorer, hunter, and warrior with nature-flavored magic.", source: srdRulesSource },
  { name: "Rogue", primaryAbilities: ["dex"], complexity: "Medium", savingThrows: ["dex", "int"], skillChoiceCount: 4, hitDie: 8, startingEquipment: equipmentChoices("rogue", [{ label: "Choose a weapon", choose: 1, options: ["rapier", "shortsword"] }, { label: "Choose a ranged weapon", choose: 1, options: ["shortbow", "dagger"] }, { label: "Choose tools", choose: 1, options: ["thieves-tools"] }]), description: "A precise expert who depends on skill, stealth, and well-placed attacks.", source: srdRulesSource },
  { name: "Sorcerer", primaryAbilities: ["cha"], complexity: "High", savingThrows: ["con", "cha"], skillChoiceCount: 2, hitDie: 6, spellcastingAbility: "cha", spellcastingKind: "known", cantripsKnownByLevel: { 1: 4 }, startingEquipment: equipmentChoices("sorcerer", [{ label: "Choose a weapon", choose: 1, options: ["dagger", "simple-weapon"] }, { label: "Choose a pack", choose: 1, options: ["explorers-pack"] }]), description: "A spellcaster whose magic comes from innate power.", source: srdRulesSource },
  { name: "Warlock", primaryAbilities: ["cha"], complexity: "High", savingThrows: ["wis", "cha"], skillChoiceCount: 2, hitDie: 8, spellcastingAbility: "cha", spellcastingKind: "pact", cantripsKnownByLevel: { 1: 2 }, startingEquipment: equipmentChoices("warlock", [{ label: "Choose a weapon", choose: 1, options: ["simple-weapon", "dagger"] }, { label: "Choose a pack", choose: 1, options: ["scholars-pack", "explorers-pack"] }]), description: "A pact-based spellcaster with unusual magic and customizable invocations.", source: srdRulesSource },
  { name: "Wizard", primaryAbilities: ["int"], complexity: "High", savingThrows: ["int", "wis"], skillChoiceCount: 2, hitDie: 6, spellcastingAbility: "int", spellcastingKind: "prepared", cantripsKnownByLevel: { 1: 3 }, startingEquipment: equipmentChoices("wizard", [{ label: "Choose a weapon", choose: 1, options: ["quarterstaff", "dagger"] }, { label: "Choose a pack", choose: 1, options: ["scholars-pack", "explorers-pack"] }, { label: "Wizard tool", choose: 1, options: ["spellbook"] }]), description: "A studied spellcaster who prepares magic from a spellbook.", source: srdRulesSource },
];

export const srdSpecies: SrdNamedOption[] = [
  { name: "Aasimar", description: "A person touched by celestial power.", speed: 30, source: srdRulesSource },
  { name: "Dragonborn", description: "A draconic people with elemental ancestry.", speed: 30, source: srdRulesSource },
  { name: "Dwarf", description: "A sturdy people often associated with endurance and craft.", speed: 30, source: srdRulesSource },
  { name: "Elf", description: "A graceful people often associated with keen senses and magic.", speed: 30, traits: ["Darkvision", "Fey Ancestry", "Trance", "Keen Senses"], languages: ["Common", "Elvish"], source: srdRulesSource },
  { name: "Gnome", description: "A small people often associated with cleverness and wonder.", speed: 30, source: srdRulesSource },
  { name: "Goliath", description: "A powerful people with giant ancestry.", speed: 35, source: srdRulesSource },
  { name: "Halfling", description: "A small people known for bravery, luck, and quick movement.", speed: 30, source: srdRulesSource },
  { name: "Human", description: "A flexible and adaptable people found across many cultures.", speed: 30, source: srdRulesSource },
  { name: "Orc", description: "A strong people often associated with endurance and intensity.", speed: 30, source: srdRulesSource },
  { name: "Tiefling", description: "A people marked by fiendish influence and innate magic.", speed: 30, source: srdRulesSource },
];

export const srdBackgrounds: SrdNamedOption[] = [
  { name: "Acolyte", description: "A life shaped by service to a temple, faith, or sacred order.", source: srdRulesSource },
  { name: "Artisan", description: "A practiced craftsperson with a trade and professional contacts.", source: srdRulesSource },
  { name: "Charlatan", description: "A practiced deceiver who knows cons, false identities, and quick talk.", source: srdRulesSource },
  { name: "Criminal", description: "A person shaped by crime, underworld contacts, or outlaw survival.", source: srdRulesSource },
  { name: "Entertainer", description: "A performer used to crowds, travel, and public attention.", source: srdRulesSource },
  { name: "Farmer", description: "A grounded life of labor, endurance, animals, and community.", source: srdRulesSource },
  { name: "Guard", description: "A watchful life of patrols, discipline, and protecting places or people.", source: srdRulesSource },
  { name: "Guide", description: "A pathfinder familiar with travel, hazards, and wilderness routes.", source: srdRulesSource },
  { name: "Hermit", description: "A secluded life of study, reflection, survival, or revelation.", source: srdRulesSource },
  { name: "Merchant", description: "A trader with business sense, negotiation, and practical contacts.", source: srdRulesSource },
  { name: "Noble", description: "A person from privilege, courtly life, lineage, or social obligation.", source: srdRulesSource },
  { name: "Sage", description: "A scholar shaped by study, research, and deep knowledge.", skills: ["arcana", "history"], tools: ["Calligrapher's Supplies"], languages: ["Choose one additional language"], backgroundFeature: "Scholarly research background feature", source: srdRulesSource },
  { name: "Sailor", description: "A seafarer used to ships, crews, storms, and distant ports.", source: srdRulesSource },
  { name: "Scribe", description: "A trained writer, clerk, record keeper, or document specialist.", source: srdRulesSource },
  { name: "Soldier", description: "A person shaped by military life, battle, ranks, and discipline.", source: srdRulesSource },
  { name: "Wayfarer", description: "A streetwise traveler used to hard roads and uncertain shelter.", source: srdRulesSource },
];

export const srdSpells: SrdSpell[] = [
  { id: "acid-splash", name: "Acid Splash", level: 0, school: "Evocation", classes: ["Sorcerer", "Wizard"], castingTime: "1 action", range: "60 feet", components: ["V", "S"], materialDetails: "", duration: "Instantaneous", concentration: false, ritual: false, description: "Hurl acid at one or two nearby creatures. A target makes a Dexterity saving throw or takes acid damage.", source: srdRulesSource },
  { id: "cure-wounds", name: "Cure Wounds", level: 1, school: "Abjuration", classes: ["Bard", "Cleric", "Druid", "Paladin", "Ranger"], castingTime: "1 action", range: "Touch", components: ["V", "S"], materialDetails: "", duration: "Instantaneous", concentration: false, ritual: false, description: "A creature you touch regains hit points. This spell has no effect on constructs or undead unless your table rules otherwise.", source: srdRulesSource },
  { id: "detect-magic", name: "Detect Magic", level: 1, school: "Divination", classes: ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Wizard"], castingTime: "1 action", range: "Self", components: ["V", "S"], materialDetails: "", duration: "Concentration, up to 10 minutes", concentration: true, ritual: true, description: "Sense the presence of magic nearby and learn the school of magic for visible magical auras.", source: srdRulesSource },
  { id: "eldritch-blast", name: "Eldritch Blast", level: 0, school: "Evocation", classes: ["Warlock"], castingTime: "1 action", range: "120 feet", components: ["V", "S"], materialDetails: "", duration: "Instantaneous", concentration: false, ritual: false, description: "Make a ranged spell attack with crackling energy. On a hit, the target takes force damage.", source: srdRulesSource },
  { id: "entangle", name: "Entangle", level: 1, school: "Conjuration", classes: ["Druid"], castingTime: "1 action", range: "90 feet", components: ["V", "S"], materialDetails: "", duration: "Concentration, up to 1 minute", concentration: true, ritual: false, description: "Plants erupt in an area, creating difficult terrain and potentially restraining creatures that fail a Strength saving throw.", source: srdRulesSource },
  { id: "faerie-fire", name: "Faerie Fire", level: 1, school: "Evocation", classes: ["Bard", "Druid"], castingTime: "1 action", range: "60 feet", components: ["V"], materialDetails: "", duration: "Concentration, up to 1 minute", concentration: true, ritual: false, description: "Outline creatures and objects in light. Attacks against affected targets can gain advantage if they fail a Dexterity saving throw.", source: srdRulesSource },
  { id: "fire-bolt", name: "Fire Bolt", level: 0, school: "Evocation", classes: ["Sorcerer", "Wizard"], castingTime: "1 action", range: "120 feet", components: ["V", "S"], materialDetails: "", duration: "Instantaneous", concentration: false, ritual: false, description: "Make a ranged spell attack with fire. On a hit, the target takes fire damage.", source: srdRulesSource },
  { id: "guidance", name: "Guidance", level: 0, school: "Divination", classes: ["Cleric", "Druid"], castingTime: "1 action", range: "Touch", components: ["V", "S"], materialDetails: "", duration: "Concentration, up to 1 minute", concentration: true, ritual: false, description: "Touch a willing creature to help one ability check before the spell ends.", source: srdRulesSource },
  { id: "healing-word", name: "Healing Word", level: 1, school: "Abjuration", classes: ["Bard", "Cleric", "Druid"], castingTime: "1 bonus action", range: "60 feet", components: ["V"], materialDetails: "", duration: "Instantaneous", concentration: false, ritual: false, description: "A creature you can see regains hit points from a brief word of healing.", source: srdRulesSource },
  { id: "light", name: "Light", level: 0, school: "Evocation", classes: ["Bard", "Cleric", "Sorcerer", "Wizard"], castingTime: "1 action", range: "Touch", components: ["V", "M"], materialDetails: "A firefly or phosphorescent moss.", duration: "1 hour", concentration: false, ritual: false, description: "Make an object shed bright light and dim light for the spell's duration.", source: srdRulesSource },
  { id: "mage-hand", name: "Mage Hand", level: 0, school: "Conjuration", classes: ["Bard", "Sorcerer", "Warlock", "Wizard"], castingTime: "1 action", range: "30 feet", components: ["V", "S"], materialDetails: "", duration: "1 minute", concentration: false, ritual: false, description: "Create a spectral hand that can manipulate objects within range.", source: srdRulesSource },
  { id: "magic-missile", name: "Magic Missile", level: 1, school: "Evocation", classes: ["Sorcerer", "Wizard"], castingTime: "1 action", range: "120 feet", components: ["V", "S"], materialDetails: "", duration: "Instantaneous", concentration: false, ritual: false, description: "Create darts of magical force that strike creatures you can see.", source: srdRulesSource },
  { id: "produce-flame", name: "Produce Flame", level: 0, school: "Conjuration", classes: ["Druid"], castingTime: "1 action", range: "Self", components: ["V", "S"], materialDetails: "", duration: "10 minutes", concentration: false, ritual: false, description: "Create flame in your hand for light or hurl it as a ranged spell attack.", source: srdRulesSource },
  { id: "sacred-flame", name: "Sacred Flame", level: 0, school: "Evocation", classes: ["Cleric"], castingTime: "1 action", range: "60 feet", components: ["V", "S"], materialDetails: "", duration: "Instantaneous", concentration: false, ritual: false, description: "Radiance descends on a creature. The target makes a Dexterity saving throw or takes radiant damage.", source: srdRulesSource },
  { id: "shillelagh", name: "Shillelagh", level: 0, school: "Transmutation", classes: ["Druid"], castingTime: "1 bonus action", range: "Touch", components: ["V", "S", "M"], materialDetails: "Mistletoe.", duration: "1 minute", concentration: false, ritual: false, description: "Empower a club or quarterstaff so it can use your spellcasting ability for attacks and damage.", source: srdRulesSource },
  { id: "shield", name: "Shield", level: 1, school: "Abjuration", classes: ["Sorcerer", "Wizard"], castingTime: "1 reaction", range: "Self", components: ["V", "S"], materialDetails: "", duration: "1 round", concentration: false, ritual: false, description: "An invisible barrier of magical force protects you briefly, including against the triggering attack.", source: srdRulesSource },
  { id: "thaumaturgy", name: "Thaumaturgy", level: 0, school: "Transmutation", classes: ["Cleric"], castingTime: "1 action", range: "30 feet", components: ["V"], materialDetails: "", duration: "Up to 1 minute", concentration: false, ritual: false, description: "Create a minor supernatural effect such as a booming voice, harmless tremors, or dramatic sensory signs.", source: srdRulesSource },
  { id: "thunderwave", name: "Thunderwave", level: 1, school: "Evocation", classes: ["Bard", "Druid", "Sorcerer", "Wizard"], castingTime: "1 action", range: "Self", components: ["V", "S"], materialDetails: "", duration: "Instantaneous", concentration: false, ritual: false, description: "A wave of thunderous force pushes creatures away from you and deals thunder damage on a failed Constitution saving throw.", source: srdRulesSource },
];

export const srdSpellMetadata = {
  levels: Array.from({ length: 10 }, (_, level) => level),
  schools: ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"],
  actionTypes: ["action", "bonusAction", "reaction", "minute", "hour", "special"] satisfies SpellActionType[],
  componentKinds: ["V", "S", "M"],
  source: srdRulesSource,
};

export function srdAbility(id: AbilityId) {
  return srdAbilities.find((ability) => ability.id === id);
}

export function srdSkill(id: SkillId) {
  return srdSkills.find((skill) => skill.id === id);
}

export function srdClass(name: string) {
  return srdClasses.find((characterClass) => characterClass.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
}

export function srdEquipmentItem(id: string) {
  return srdEquipment.find((item) => item.id === id);
}

export function srdSpell(id: string) {
  return srdSpells.find((spell) => spell.id === id);
}
