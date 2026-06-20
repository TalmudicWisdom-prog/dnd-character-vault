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
  source: RulesSource;
};

export type SrdNamedOption = {
  name: string;
  description: string;
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

export const srdClasses: SrdClass[] = [
  { name: "Barbarian", primaryAbilities: ["str"], description: "A fierce warrior who relies on rage, toughness, and physical power.", source: srdRulesSource },
  { name: "Bard", primaryAbilities: ["cha"], description: "A performer and spellcaster who inspires allies and solves problems with skill.", source: srdRulesSource },
  { name: "Cleric", primaryAbilities: ["wis"], description: "A divine spellcaster shaped by faith, healing, protection, and sacred power.", source: srdRulesSource },
  { name: "Druid", primaryAbilities: ["wis"], description: "A nature-focused spellcaster connected to beasts, terrain, and primal magic.", source: srdRulesSource },
  { name: "Fighter", primaryAbilities: ["str", "dex"], description: "A flexible weapon expert built around martial training and reliable combat.", source: srdRulesSource },
  { name: "Monk", primaryAbilities: ["dex", "wis"], description: "A disciplined martial artist who uses speed, focus, and precise strikes.", source: srdRulesSource },
  { name: "Paladin", primaryAbilities: ["str", "cha"], description: "An oath-bound warrior with protective magic, healing, and powerful strikes.", source: srdRulesSource },
  { name: "Ranger", primaryAbilities: ["dex", "wis"], description: "A skilled explorer, hunter, and warrior with nature-flavored magic.", source: srdRulesSource },
  { name: "Rogue", primaryAbilities: ["dex"], description: "A precise expert who depends on skill, stealth, and well-placed attacks.", source: srdRulesSource },
  { name: "Sorcerer", primaryAbilities: ["cha"], description: "A spellcaster whose magic comes from innate power.", source: srdRulesSource },
  { name: "Warlock", primaryAbilities: ["cha"], description: "A pact-based spellcaster with unusual magic and customizable invocations.", source: srdRulesSource },
  { name: "Wizard", primaryAbilities: ["int"], description: "A studied spellcaster who prepares magic from a spellbook.", source: srdRulesSource },
];

export const srdSpecies: SrdNamedOption[] = [
  { name: "Aasimar", description: "A person touched by celestial power.", source: srdRulesSource },
  { name: "Dragonborn", description: "A draconic people with elemental ancestry.", source: srdRulesSource },
  { name: "Dwarf", description: "A sturdy people often associated with endurance and craft.", source: srdRulesSource },
  { name: "Elf", description: "A graceful people often associated with keen senses and magic.", source: srdRulesSource },
  { name: "Gnome", description: "A small people often associated with cleverness and wonder.", source: srdRulesSource },
  { name: "Goliath", description: "A powerful people with giant ancestry.", source: srdRulesSource },
  { name: "Halfling", description: "A small people known for bravery, luck, and quick movement.", source: srdRulesSource },
  { name: "Human", description: "A flexible and adaptable people found across many cultures.", source: srdRulesSource },
  { name: "Orc", description: "A strong people often associated with endurance and intensity.", source: srdRulesSource },
  { name: "Tiefling", description: "A people marked by fiendish influence and innate magic.", source: srdRulesSource },
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
  { name: "Sage", description: "A scholar shaped by study, research, and deep knowledge.", source: srdRulesSource },
  { name: "Sailor", description: "A seafarer used to ships, crews, storms, and distant ports.", source: srdRulesSource },
  { name: "Scribe", description: "A trained writer, clerk, record keeper, or document specialist.", source: srdRulesSource },
  { name: "Soldier", description: "A person shaped by military life, battle, ranks, and discipline.", source: srdRulesSource },
  { name: "Wayfarer", description: "A streetwise traveler used to hard roads and uncertain shelter.", source: srdRulesSource },
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
