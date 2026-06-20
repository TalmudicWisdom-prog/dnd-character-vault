import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import type { AbilityId, CharacterCreationDraft, CreationEquipmentItem, SkillId } from "../../domain/models";
import { abilityModifier, formatModifier, proficiencyBonusForLevel, skillModifier } from "../../domain/dndMath";
import { abilityIds, skillIds } from "../../storage/characterSheets";
import {
  createCharacterFromCreationDraft,
  getOrCreateCreationDraft,
  resetCreationDraft,
  saveCreationDraft,
} from "../../storage/characterCreation";

const steps = [
  "Essentials",
  "Concept",
  "Abilities",
  "Skills",
  "Combat",
  "Proficiencies",
  "Equipment",
  "Spells",
  "Features",
  "Review",
];

const abilityLabels: Record<AbilityId, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const skillLabels: Record<SkillId, string> = {
  acrobatics: "Acrobatics",
  animalHandling: "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  sleightOfHand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

const skillAbilityLabels: Record<SkillId, AbilityId> = {
  acrobatics: "dex",
  animalHandling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleightOfHand: "dex",
  stealth: "dex",
  survival: "wis",
};

function LevelUpHint() {
  return <small className="level-up-hint">Usually changed during level up.</small>;
}

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function CreateCharacterWizardPage() {
  const [draft, setDraft] = useState<CharacterCreationDraft | null>(null);
  const [status, setStatus] = useState("Loading saved draft...");
  const [creating, setCreating] = useState(false);
  const dirtyVersion = useRef(0);

  useEffect(() => {
    let active = true;
    void getOrCreateCreationDraft().then((loaded) => {
      if (!active) return;
      setDraft(loaded);
      setStatus("Draft saved locally");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draft) return;
    const version = dirtyVersion.current;
    const timer = window.setTimeout(async () => {
      const saved = await saveCreationDraft(draft);
      if (version === dirtyVersion.current) {
        setDraft(saved);
        setStatus("Draft saved locally");
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const update = (change: (current: CharacterCreationDraft) => CharacterCreationDraft) => {
    dirtyVersion.current += 1;
    setDraft((current) => current ? change(current) : current);
    setStatus("Saving draft locally...");
  };

  const updateCharacter = <Key extends keyof CharacterCreationDraft["character"]>(key: Key, value: CharacterCreationDraft["character"][Key]) =>
    update((current) => {
      const character = { ...current.character, [key]: value };
      const level = key === "level" ? Number(value) : character.level;
      return {
        ...current,
        character,
        sheet: { ...current.sheet, proficiencyBonus: proficiencyBonusForLevel(level) },
      };
    });

  const updateSheet = <Key extends keyof CharacterCreationDraft["sheet"]>(key: Key, value: CharacterCreationDraft["sheet"][Key]) =>
    update((current) => ({ ...current, sheet: { ...current.sheet, [key]: value } }));

  const setStep = (step: number) => update((current) => ({ ...current, step: Math.max(0, Math.min(steps.length - 1, step)) }));

  const addEquipment = () => update((current) => ({
    ...current,
    equipment: [...current.equipment, { id: crypto.randomUUID(), name: "", quantity: 1, notes: "", equipped: false }],
  }));

  const updateEquipment = (id: string, change: Partial<CreationEquipmentItem>) => update((current) => ({
    ...current,
    equipment: current.equipment.map((item) => item.id === id ? { ...item, ...change } : item),
  }));

  const removeEquipment = (id: string) => update((current) => ({
    ...current,
    equipment: current.equipment.filter((item) => item.id !== id),
  }));

  const canCreate = Boolean(draft?.character.name.trim() && draft.character.characterClass.trim() && draft.character.ancestry.trim() && draft.character.level);
  const spellSlotLevels = useMemo(() => Array.from({ length: 9 }, (_, index) => String(index + 1)), []);

  const create = async () => {
    if (!draft || !canCreate) {
      setStatus("Name, class, species/ancestry, and level are required.");
      return;
    }
    setCreating(true);
    try {
      const character = await createCharacterFromCreationDraft(draft);
      window.location.hash = `sheet/${character.id}`;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create character");
      setCreating(false);
    }
  };

  const startOver = async () => {
    if (!window.confirm("Clear this saved character creation draft?")) return;
    const empty = await resetCreationDraft();
    setDraft(empty);
    setStatus("Draft reset locally");
  };

  if (!draft) return <section className="page"><div className="loading-state">Opening character creator...</div></section>;

  const step = draft.step;
  const sheet = draft.sheet;
  const character = draft.character;

  return (
    <section className="page create-character-page">
      <PageHeader
        eyebrow="Guided creation"
        title="Create Character"
        description="Build a playable character step by step, or import one from PDFs and photos."
        actions={<div className="header-action-group"><a className="secondary-button button-link" href="#import">Import Character</a><a className="secondary-button button-link" href="#characters">Back</a></div>}
      />

      <div className="creation-layout">
        <aside className="panel creation-steps" aria-label="Character creation steps">
          {steps.map((label, index) => (
            <button className={step === index ? "creation-step active" : "creation-step"} key={label} onClick={() => setStep(index)} type="button">
              <span>{index + 1}</span>{label}
            </button>
          ))}
          <button className="text-button danger" onClick={() => void startOver()} type="button">Clear saved draft</button>
        </aside>

        <article className="panel creation-panel">
          <div className="form-section-heading">
            <div><span className="card-label">Step {step + 1} of {steps.length}</span><h2>{steps[step]}</h2></div>
            <span className="save-state">{status}</span>
          </div>

          {step === 0 && <div className="form-grid">
            <label className="form-field"><span>Character name *</span><input autoFocus maxLength={100} onChange={(event) => updateCharacter("name", event.target.value)} value={character.name} /></label>
            <label className="form-field"><span>Player name</span><input maxLength={100} onChange={(event) => updateCharacter("playerName", event.target.value)} value={character.playerName ?? ""} /></label>
            <label className="form-field"><span>Campaign</span><input maxLength={100} onChange={(event) => updateCharacter("campaign", event.target.value)} value={character.campaign ?? ""} /></label>
            <label className="form-field level-up-field"><span>Level * <LevelUpHint /></span><input max={20} min={1} onChange={(event) => updateCharacter("level", Number(event.target.value))} type="number" value={character.level ?? 1} /></label>
            <label className="form-field"><span>Class *</span><input maxLength={100} onChange={(event) => updateCharacter("characterClass", event.target.value)} value={character.characterClass ?? ""} /></label>
            <label className="form-field"><span>Species / Ancestry *</span><input maxLength={100} onChange={(event) => updateCharacter("ancestry", event.target.value)} value={character.ancestry ?? ""} /></label>
            <label className="form-field full-width"><span>Background / Origin</span><input maxLength={100} onChange={(event) => updateCharacter("background", event.target.value)} value={character.background ?? ""} /></label>
          </div>}

          {step === 1 && <div className="form-grid">
            <label className="form-field full-width"><span>Short concept</span><input maxLength={500} onChange={(event) => updateCharacter("concept", event.target.value)} placeholder="Undead hunter, reluctant royal heir, sky pirate medic..." value={character.concept ?? ""} /></label>
            <label className="form-field full-width"><span>Personality notes</span><textarea onChange={(event) => updateCharacter("personalityNotes", event.target.value)} rows={4} value={character.personalityNotes ?? ""} /></label>
            <label className="form-field full-width"><span>Backstory</span><textarea onChange={(event) => updateCharacter("backstory", event.target.value)} rows={8} value={character.backstory ?? ""} /></label>
            <label className="form-field"><span>Goals</span><textarea onChange={(event) => updateCharacter("goals", event.target.value)} rows={5} value={character.goals ?? ""} /></label>
            <label className="form-field"><span>Important relationships</span><textarea onChange={(event) => updateCharacter("importantRelationships", event.target.value)} rows={5} value={character.importantRelationships ?? ""} /></label>
            <label className="form-field full-width"><span>Roleplay notes</span><textarea onChange={(event) => updateCharacter("roleplayNotes", event.target.value)} rows={5} value={character.roleplayNotes ?? ""} /></label>
          </div>}

          {step === 2 && <div className="ability-grid creation-ability-grid">
            {abilityIds.map((ability) => {
              const score = sheet.abilityScores[ability] ?? 10;
              return <label className="ability-card level-up-field" key={ability}><span>{abilityLabels[ability]}</span><strong>{formatModifier(abilityModifier(score))}</strong><input min={1} max={30} onChange={(event) => updateSheet("abilityScores", { ...sheet.abilityScores, [ability]: Number(event.target.value) })} type="number" value={score} /><LevelUpHint /></label>;
            })}
          </div>}

          {step === 3 && <div className="proficiency-grid creation-proficiency-grid">
            <article>
              <h3>Proficiency bonus <span className="level-up-hint">Usually changed during level up.</span></h3>
              <label className="big-stat"><span>Bonus</span><input min={2} max={6} onChange={(event) => updateSheet("proficiencyBonus", Number(event.target.value))} type="number" value={sheet.proficiencyBonus} /></label>
              <h3>Saving throw proficiencies</h3>
              <div className="check-list">{abilityIds.map((ability) => <label className="proficiency-row" key={ability}><input checked={sheet.savingThrows[ability] ?? false} onChange={(event) => updateSheet("savingThrows", { ...sheet.savingThrows, [ability]: event.target.checked })} type="checkbox" /><span>{abilityLabels[ability]}</span><small>{formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10) + (sheet.savingThrows[ability] ? sheet.proficiencyBonus : 0))}</small></label>)}</div>
            </article>
            <article>
              <h3>Skill proficiencies</h3>
              <div className="check-list skills-list">{skillIds.map((skill) => <label className="proficiency-row" key={skill}><input checked={sheet.skillProficiencies[skill] ?? false} onChange={(event) => updateSheet("skillProficiencies", { ...sheet.skillProficiencies, [skill]: event.target.checked })} type="checkbox" /><span>{skillLabels[skill]}</span><small>{abilityLabels[skillAbilityLabels[skill]].slice(0, 3)} {formatModifier(skillModifier(sheet, skill))}</small></label>)}</div>
            </article>
          </div>}

          {step === 4 && <div className="form-grid">
            <label className="form-field"><span>Armor Class</span><input min={0} onChange={(event) => updateSheet("armorClass", Number(event.target.value))} type="number" value={sheet.armorClass} /></label>
            <label className="form-field"><span>Initiative</span><input onChange={(event) => updateSheet("initiative", Number(event.target.value))} type="number" value={sheet.initiative} /></label>
            <label className="form-field"><span>Speed</span><input min={0} onChange={(event) => updateSheet("speed", Number(event.target.value))} type="number" value={sheet.speed} /></label>
            <label className="form-field level-up-field"><span>Max HP <LevelUpHint /></span><input min={0} onChange={(event) => updateSheet("maxHp", Number(event.target.value))} type="number" value={sheet.maxHp} /></label>
            <label className="form-field"><span>Current HP</span><input min={0} onChange={(event) => updateSheet("currentHp", Number(event.target.value))} type="number" value={sheet.currentHp} /></label>
            <label className="form-field"><span>Temporary HP</span><input min={0} onChange={(event) => updateSheet("temporaryHp", Number(event.target.value))} type="number" value={sheet.temporaryHp} /></label>
            <label className="form-field level-up-field"><span>Hit Dice <LevelUpHint /></span><input maxLength={100} onChange={(event) => updateSheet("hitDice", event.target.value)} placeholder="1d8, 3d10..." value={sheet.hitDice} /></label>
            <label className="form-field"><span>Death saves</span><input readOnly value={`${sheet.deathSaveSuccesses} successes / ${sheet.deathSaveFailures} failures`} /></label>
            <label className="form-field"><span>Attacks</span><textarea onChange={(event) => updateSheet("attacks", event.target.value)} rows={4} value={sheet.attacks} /></label>
            <label className="form-field"><span>Weapons</span><textarea onChange={(event) => updateSheet("weapons", event.target.value)} rows={4} value={sheet.weapons} /></label>
            <label className="form-field full-width"><span>Damage notes</span><textarea onChange={(event) => updateSheet("damageNotes", event.target.value)} rows={4} value={sheet.damageNotes} /></label>
          </div>}

          {step === 5 && <div className="form-grid">
            <label className="form-field"><span>Armor proficiencies</span><textarea onChange={(event) => updateSheet("armorProficiencies", event.target.value)} rows={6} value={sheet.armorProficiencies} /></label>
            <label className="form-field"><span>Weapon proficiencies</span><textarea onChange={(event) => updateSheet("weaponProficiencies", event.target.value)} rows={6} value={sheet.weaponProficiencies} /></label>
            <label className="form-field"><span>Tool proficiencies</span><textarea onChange={(event) => updateSheet("toolProficiencies", event.target.value)} rows={6} value={sheet.toolProficiencies} /></label>
            <label className="form-field"><span>Languages</span><textarea onChange={(event) => updateSheet("languages", event.target.value)} rows={6} value={sheet.languages} /></label>
          </div>}

          {step === 6 && <div className="creation-equipment-list">
            <button className="secondary-button" onClick={addEquipment} type="button">Add equipment item</button>
            {draft.equipment.map((item) => <article className="creation-equipment-row" key={item.id}>
              <label className="form-field"><span>Item name</span><input onChange={(event) => updateEquipment(item.id, { name: event.target.value })} value={item.name} /></label>
              <label className="form-field"><span>Quantity</span><input min={0} onChange={(event) => updateEquipment(item.id, { quantity: Number(event.target.value) })} type="number" value={item.quantity} /></label>
              <label className="touch-toggle"><input checked={item.equipped} onChange={(event) => updateEquipment(item.id, { equipped: event.target.checked })} type="checkbox" /><span>Equipped</span></label>
              <label className="form-field full-width"><span>Notes</span><textarea onChange={(event) => updateEquipment(item.id, { notes: event.target.value })} rows={3} value={item.notes} /></label>
              <button className="text-button danger" onClick={() => removeEquipment(item.id)} type="button">Remove</button>
            </article>)}
          </div>}

          {step === 7 && <div className="form-grid">
            <label className="form-field"><span>Spellcasting ability</span><select onChange={(event) => updateSheet("spellcastingAbility", event.target.value ? event.target.value as AbilityId : null)} value={sheet.spellcastingAbility ?? ""}><option value="">None / not set</option>{abilityIds.map((ability) => <option key={ability} value={ability}>{abilityLabels[ability]}</option>)}</select></label>
            <label className="form-field"><span>Spell save DC</span><input min={0} onChange={(event) => updateSheet("spellSaveDc", Number(event.target.value))} type="number" value={sheet.spellSaveDc} /></label>
            <label className="form-field"><span>Spell attack bonus</span><input onChange={(event) => updateSheet("spellAttackBonus", Number(event.target.value))} type="number" value={sheet.spellAttackBonus} /></label>
            <label className="form-field level-up-field"><span>Spell slots <LevelUpHint /></span><div className="slot-grid">{spellSlotLevels.map((level) => <label key={level}><small>L{level}</small><input min={0} onChange={(event) => updateSheet("spellSlots", { ...sheet.spellSlots, [level]: Number(event.target.value) })} type="number" value={sheet.spellSlots[level] ?? 0} /></label>)}</div></label>
            <label className="form-field"><span>Cantrips</span><textarea onChange={(event) => updateSheet("cantrips", event.target.value)} placeholder="One per line" rows={6} value={sheet.cantrips} /></label>
            <label className="form-field"><span>Prepared spells</span><textarea onChange={(event) => updateSheet("preparedSpells", event.target.value)} placeholder="One per line" rows={6} value={sheet.preparedSpells} /></label>
            <label className="form-field full-width"><span>Spell notes</span><textarea onChange={(event) => updateSheet("spellNotes", event.target.value)} rows={5} value={sheet.spellNotes} /></label>
          </div>}

          {step === 8 && <div className="form-grid">
            <label className="form-field level-up-field"><span>Class features <LevelUpHint /></span><textarea onChange={(event) => updateSheet("classFeatures", event.target.value)} rows={7} value={sheet.classFeatures} /></label>
            <label className="form-field"><span>Species traits</span><textarea onChange={(event) => updateSheet("speciesTraits", event.target.value)} rows={7} value={sheet.speciesTraits} /></label>
            <label className="form-field"><span>Background feature</span><textarea onChange={(event) => updateSheet("backgroundFeature", event.target.value)} rows={5} value={sheet.backgroundFeature} /></label>
            <label className="form-field level-up-field"><span>Feats <LevelUpHint /></span><textarea onChange={(event) => updateSheet("feats", event.target.value)} rows={5} value={sheet.feats} /></label>
            <label className="form-field full-width"><span>Special abilities</span><textarea onChange={(event) => updateSheet("specialAbilities", event.target.value)} rows={6} value={sheet.specialAbilities} /></label>
          </div>}

          {step === 9 && <div className="review-stack">
            <section><h3>Required details</h3><p><strong>{character.name || "Unnamed"}</strong> · Level {character.level} {character.characterClass || "Class missing"} · {character.ancestry || "Ancestry missing"}</p>{!canCreate && <p className="inline-message">Name, class, species/ancestry, and level are required before creating.</p>}</section>
            <section><h3>Concept</h3><p>{character.concept || character.backstory || "No concept or backstory yet."}</p></section>
            <section><h3>Abilities</h3><div className="review-pill-row">{abilityIds.map((ability) => <span key={ability}>{abilityLabels[ability].slice(0, 3)} {sheet.abilityScores[ability]} ({formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10))})</span>)}</div></section>
            <section><h3>Equipment and spells</h3><p>{draft.equipment.filter((item) => item.name.trim()).length} equipment items · {lines(sheet.cantrips).length} cantrips · {lines(sheet.preparedSpells).length} prepared spells</p></section>
          </div>}

          <div className="creation-nav">
            <button className="secondary-button" disabled={step === 0} onClick={() => setStep(step - 1)} type="button">Back</button>
            {step < steps.length - 1 ? <button className="primary-button" onClick={() => setStep(step + 1)} type="button">Next</button> : <button className="primary-button" disabled={!canCreate || creating} onClick={() => void create()} type="button">Create character</button>}
          </div>
        </article>
      </div>
    </section>
  );
}
