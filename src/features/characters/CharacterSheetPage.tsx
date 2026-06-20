import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { AbilityId, CharacterSheet, SkillId } from "../../domain/models";
import { abilityModifier, formatModifier, proficiencyBonusForLevel, skillAbilities, skillModifier } from "../../domain/dndMath";
import { PageHeader } from "../../components/PageHeader";
import { abilityIds, getOrCreateCharacterSheet, saveCharacterSheet, skillIds } from "../../storage/characterSheets";
import { db } from "../../storage/database";
import { InventorySection } from "./InventorySection";
import { SoulReaperSection } from "./SoulReaperSection";

const abilityLabels: Record<AbilityId, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
};

const skillLabels: Record<SkillId, string> = {
  acrobatics: "Acrobatics", animalHandling: "Animal Handling", arcana: "Arcana",
  athletics: "Athletics", deception: "Deception", history: "History", insight: "Insight",
  intimidation: "Intimidation", investigation: "Investigation", medicine: "Medicine",
  nature: "Nature", perception: "Perception", performance: "Performance", persuasion: "Persuasion",
  religion: "Religion", sleightOfHand: "Sleight of Hand", stealth: "Stealth", survival: "Survival",
};

function LevelUpHint() {
  return <small className="level-up-hint">Usually changed during level up.</small>;
}

export function CharacterSheetPage({ characterId }: { characterId: string }) {
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const [sheet, setSheet] = useState<CharacterSheet | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("Saved locally");
  const [hpAmount, setHpAmount] = useState(1);
  const editVersion = useRef(0);

  useEffect(() => {
    let active = true;
    void getOrCreateCharacterSheet(characterId)
      .then((loaded) => { if (active) setSheet(loaded); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? `${error.name}: ${error.message}` : String(error)); });
    return () => { active = false; };
  }, [characterId]);

  useEffect(() => {
    if (!sheet || status !== "Unsaved changes") return;
    const timer = window.setTimeout(async () => {
      const version = editVersion.current;
      setStatus("Saving locally...");
      try {
        const saved = await saveCharacterSheet(sheet);
        if (editVersion.current === version) {
          setSheet(saved);
          setStatus("Saved locally");
        } else {
          setStatus("Unsaved changes");
        }
      } catch {
        setStatus("Could not save");
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [sheet, status]);

  const edit = (change: (current: CharacterSheet) => CharacterSheet) => {
    editVersion.current += 1;
    setSheet((current) => current ? change(current) : current);
    setStatus("Unsaved changes");
  };

  const changeHp = async (mode: "damage" | "healing") => {
    if (!sheet) return;
    const amount = Math.max(0, hpAmount);
    let currentHp = sheet.currentHp;
    let temporaryHp = sheet.temporaryHp;
    if (mode === "damage") {
      const absorbed = Math.min(temporaryHp, amount);
      temporaryHp -= absorbed;
      currentHp = Math.max(0, currentHp - Math.max(0, amount - absorbed));
    } else {
      currentHp = Math.min(sheet.maxHp, currentHp + amount);
    }

    setStatus("Saving locally...");
    const updated = await saveCharacterSheet({ ...sheet, currentHp, temporaryHp });
    setSheet(updated);
    setStatus("Saved locally");
  };

  const updateCharacterField = async (changes: Record<string, string | number>) => {
    await db.characters.update(characterId, { ...changes, updatedAt: new Date().toISOString() });
  };

  if (loadError) return <section className="page"><div className="loading-state">Could not open character sheet: {loadError}</div></section>;
  if (!character || !sheet) return <section className="page"><div className="loading-state">Opening character sheet...</div></section>;

  return (
    <section className="page sheet-page">
      <PageHeader
        eyebrow="Play tools"
        title={character.name}
        description="A touch-friendly sheet for the details you reach for during play."
        actions={<div className="header-action-group"><a className="primary-button button-link" href={`#spellbook/${characterId}`}>Spellbook</a><a className="secondary-button button-link" href={`#character/${characterId}`}>Profile</a><a className="secondary-button button-link" href="#characters">Characters</a></div>}
      />

      <div className="sheet-status"><span className="status-dot" />{status}</div>

      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Overview</span><h2>Character identity</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Name</span><input maxLength={100} onChange={(event) => void updateCharacterField({ name: event.target.value })} value={character.name} /></label>
          <label className="form-field"><span>Player name</span><input maxLength={100} onChange={(event) => void updateCharacterField({ playerName: event.target.value })} value={character.playerName} /></label>
          <label className="form-field"><span>Campaign</span><input maxLength={100} onChange={(event) => void updateCharacterField({ campaign: event.target.value })} value={character.campaign} /></label>
          <label className="form-field level-up-field"><span>Level <LevelUpHint /></span><input max={20} min={1} onChange={(event) => void updateCharacterField({ level: Number(event.target.value) }).then(() => edit((current) => ({ ...current, proficiencyBonus: proficiencyBonusForLevel(Number(event.target.value)) })))} type="number" value={character.level} /></label>
          <label className="form-field"><span>Class</span><input maxLength={100} onChange={(event) => void updateCharacterField({ characterClass: event.target.value })} value={character.characterClass} /></label>
          <label className="form-field"><span>Species / Ancestry</span><input maxLength={100} onChange={(event) => void updateCharacterField({ ancestry: event.target.value })} value={character.ancestry} /></label>
          <label className="form-field full-width"><span>Background / Origin</span><input maxLength={100} onChange={(event) => void updateCharacterField({ background: event.target.value })} value={character.background} /></label>
          <label className="form-field full-width"><span>Short concept</span><input maxLength={500} onChange={(event) => void updateCharacterField({ concept: event.target.value })} value={character.concept} /></label>
        </div>
      </article>

      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Roleplay</span><h2>Concept and backstory</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Personality notes</span><textarea onChange={(event) => void updateCharacterField({ personalityNotes: event.target.value })} rows={5} value={character.personalityNotes} /></label>
          <label className="form-field"><span>Goals</span><textarea onChange={(event) => void updateCharacterField({ goals: event.target.value })} rows={5} value={character.goals} /></label>
          <label className="form-field"><span>Important relationships</span><textarea onChange={(event) => void updateCharacterField({ importantRelationships: event.target.value })} rows={5} value={character.importantRelationships} /></label>
          <label className="form-field"><span>Roleplay notes</span><textarea onChange={(event) => void updateCharacterField({ roleplayNotes: event.target.value })} rows={5} value={character.roleplayNotes} /></label>
          <label className="form-field full-width"><span>Backstory</span><textarea onChange={(event) => void updateCharacterField({ backstory: event.target.value, summary: event.target.value.slice(0, 20000) })} rows={8} value={character.backstory} /></label>
        </div>
      </article>

      <div className="play-grid">
        <article className="panel hp-panel">
          <div className="form-section-heading"><div><span className="card-label">Hit points</span><h2>Health</h2></div></div>
          <div className="hp-values">
            <label className="stat-field"><span>Current</span><input min={0} onChange={(event) => edit((current) => ({ ...current, currentHp: Number(event.target.value) }))} type="number" value={sheet.currentHp} /></label>
            <span className="hp-divider">/</span>
            <label className="stat-field level-up-field"><span>Maximum <LevelUpHint /></span><input min={0} onChange={(event) => edit((current) => ({ ...current, maxHp: Number(event.target.value) }))} type="number" value={sheet.maxHp} /></label>
            <label className="stat-field temp-hp"><span>Temporary</span><input min={0} onChange={(event) => edit((current) => ({ ...current, temporaryHp: Number(event.target.value) }))} type="number" value={sheet.temporaryHp} /></label>
          </div>
          <div className="hp-controls">
            <div className="quick-values" aria-label="Quick HP amount">
              {[1, 5, 10, 25].map((amount) => <button className={hpAmount === amount ? "quick-value active" : "quick-value"} key={amount} onClick={() => setHpAmount(amount)} type="button">{amount}</button>)}
              <label className="sr-only" htmlFor="hp-amount">Custom HP amount</label>
              <input id="hp-amount" min={0} onChange={(event) => setHpAmount(Number(event.target.value))} type="number" value={hpAmount} />
            </div>
            <div className="hp-action-buttons">
              <button className="touch-button damage-button" onClick={() => void changeHp("damage")} type="button">Take {hpAmount} damage</button>
              <button className="touch-button healing-button" onClick={() => void changeHp("healing")} type="button">Heal {hpAmount} HP</button>
            </div>
          </div>
        </article>

        <article className="panel combat-panel">
          <div className="form-section-heading"><div><span className="card-label">Combat</span><h2>Defenses and movement</h2></div></div>
          <div className="combat-stats">
            <label className="big-stat"><span>Armor Class</span><input min={0} onChange={(event) => edit((current) => ({ ...current, armorClass: Number(event.target.value) }))} type="number" value={sheet.armorClass} /></label>
            <label className="big-stat"><span>Initiative</span><input onChange={(event) => edit((current) => ({ ...current, initiative: Number(event.target.value) }))} type="number" value={sheet.initiative} /></label>
            <label className="big-stat"><span>Speed</span><input min={0} onChange={(event) => edit((current) => ({ ...current, speed: Number(event.target.value) }))} type="number" value={sheet.speed} /></label>
          </div>
          <div className="form-grid combat-extra-grid">
            <label className="form-field level-up-field"><span>Hit Dice <LevelUpHint /></span><input onChange={(event) => edit((current) => ({ ...current, hitDice: event.target.value }))} value={sheet.hitDice} /></label>
            <label className="form-field"><span>Death save successes</span><input max={3} min={0} onChange={(event) => edit((current) => ({ ...current, deathSaveSuccesses: Number(event.target.value) }))} type="number" value={sheet.deathSaveSuccesses} /></label>
            <label className="form-field"><span>Death save failures</span><input max={3} min={0} onChange={(event) => edit((current) => ({ ...current, deathSaveFailures: Number(event.target.value) }))} type="number" value={sheet.deathSaveFailures} /></label>
          </div>
        </article>
      </div>

      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Core abilities</span><h2>Ability scores</h2><p>These remain editable, but are normally adjusted during level-up choices.</p></div></div>
        <div className="ability-grid">
          {abilityIds.map((ability) => (
            <label className="ability-card" key={ability}>
              <span>{abilityLabels[ability]}</span>
              <strong>{formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10))}</strong>
              <input min={1} max={30} onChange={(event) => edit((current) => ({ ...current, abilityScores: { ...current.abilityScores, [ability]: Number(event.target.value) } }))} type="number" value={sheet.abilityScores[ability] ?? 10} />
              <LevelUpHint />
            </label>
          ))}
        </div>
      </article>

      <div className="proficiency-grid">
        <article className="panel sheet-section">
          <div className="form-section-heading"><div><span className="card-label">Proficiencies</span><h2>Saving throws</h2><p>Proficiency bonus: <strong>{formatModifier(sheet.proficiencyBonus)}</strong> <span className="level-up-hint">Usually changed during level up.</span></p></div><label className="form-field compact-field"><span>Override</span><input min={2} max={6} onChange={(event) => edit((current) => ({ ...current, proficiencyBonus: Number(event.target.value) }))} type="number" value={sheet.proficiencyBonus} /></label></div>
          <div className="check-list">
            {abilityIds.map((ability) => <label className="proficiency-row" key={ability}><input checked={sheet.savingThrows[ability] ?? false} onChange={(event) => edit((current) => ({ ...current, savingThrows: { ...current.savingThrows, [ability]: event.target.checked } }))} type="checkbox" /><span>{abilityLabels[ability]}</span><small>{formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10) + (sheet.savingThrows[ability] ? sheet.proficiencyBonus : 0))}</small></label>)}
          </div>
        </article>
        <article className="panel sheet-section">
          <div className="form-section-heading"><div><span className="card-label">Proficiencies</span><h2>Skills</h2></div></div>
          <div className="check-list skills-list">
            {skillIds.map((skill) => <label className="proficiency-row" key={skill}><input checked={sheet.skillProficiencies[skill] ?? false} onChange={(event) => edit((current) => ({ ...current, skillProficiencies: { ...current.skillProficiencies, [skill]: event.target.checked } }))} type="checkbox" /><span>{skillLabels[skill]}</span><small>{abilityLabels[skillAbilities[skill]]} {formatModifier(skillModifier(sheet, skill))}</small></label>)}
          </div>
        </article>
      </div>

      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Combat</span><h2>Attacks, weapons, and damage</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Attacks</span><textarea onChange={(event) => edit((current) => ({ ...current, attacks: event.target.value }))} rows={5} value={sheet.attacks} /></label>
          <label className="form-field"><span>Weapons</span><textarea onChange={(event) => edit((current) => ({ ...current, weapons: event.target.value }))} rows={5} value={sheet.weapons} /></label>
          <label className="form-field full-width"><span>Damage notes</span><textarea onChange={(event) => edit((current) => ({ ...current, damageNotes: event.target.value }))} rows={4} value={sheet.damageNotes} /></label>
        </div>
      </article>

      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Training</span><h2>Proficiencies & Languages</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Armor proficiencies</span><textarea onChange={(event) => edit((current) => ({ ...current, armorProficiencies: event.target.value }))} rows={4} value={sheet.armorProficiencies} /></label>
          <label className="form-field"><span>Weapon proficiencies</span><textarea onChange={(event) => edit((current) => ({ ...current, weaponProficiencies: event.target.value }))} rows={4} value={sheet.weaponProficiencies} /></label>
          <label className="form-field"><span>Tool proficiencies</span><textarea onChange={(event) => edit((current) => ({ ...current, toolProficiencies: event.target.value }))} rows={4} value={sheet.toolProficiencies} /></label>
          <label className="form-field"><span>Languages</span><textarea onChange={(event) => edit((current) => ({ ...current, languages: event.target.value }))} rows={4} value={sheet.languages} /></label>
        </div>
      </article>

      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Magic</span><h2>Spells</h2><p>Use this quick section for casting stats and prepared notes, or open the full spellbook.</p></div><a className="secondary-button button-link" href={`#spellbook/${characterId}`}>Full spellbook</a></div>
        <div className="form-grid">
          <label className="form-field"><span>Spellcasting ability</span><select onChange={(event) => edit((current) => ({ ...current, spellcastingAbility: event.target.value ? event.target.value as AbilityId : null }))} value={sheet.spellcastingAbility ?? ""}><option value="">None / not set</option>{abilityIds.map((ability) => <option key={ability} value={ability}>{abilityLabels[ability]}</option>)}</select></label>
          <label className="form-field"><span>Spell save DC</span><input min={0} onChange={(event) => edit((current) => ({ ...current, spellSaveDc: Number(event.target.value) }))} type="number" value={sheet.spellSaveDc} /></label>
          <label className="form-field"><span>Spell attack bonus</span><input onChange={(event) => edit((current) => ({ ...current, spellAttackBonus: Number(event.target.value) }))} type="number" value={sheet.spellAttackBonus} /></label>
          <label className="form-field level-up-field"><span>Spell slots <LevelUpHint /></span><div className="slot-grid">{Array.from({ length: 9 }, (_, index) => String(index + 1)).map((level) => <label key={level}><small>L{level}</small><input min={0} onChange={(event) => edit((current) => ({ ...current, spellSlots: { ...current.spellSlots, [level]: Number(event.target.value) } }))} type="number" value={sheet.spellSlots[level] ?? 0} /></label>)}</div></label>
          <label className="form-field"><span>Cantrips</span><textarea onChange={(event) => edit((current) => ({ ...current, cantrips: event.target.value }))} rows={5} value={sheet.cantrips} /></label>
          <label className="form-field"><span>Prepared spells</span><textarea onChange={(event) => edit((current) => ({ ...current, preparedSpells: event.target.value }))} rows={5} value={sheet.preparedSpells} /></label>
          <label className="form-field full-width"><span>Spell notes</span><textarea onChange={(event) => edit((current) => ({ ...current, spellNotes: event.target.value }))} rows={5} value={sheet.spellNotes} /></label>
        </div>
      </article>

      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Features</span><h2>Features & Traits</h2></div></div>
        <div className="form-grid">
          <label className="form-field level-up-field"><span>Class features <LevelUpHint /></span><textarea onChange={(event) => edit((current) => ({ ...current, classFeatures: event.target.value }))} rows={6} value={sheet.classFeatures} /></label>
          <label className="form-field"><span>Species traits</span><textarea onChange={(event) => edit((current) => ({ ...current, speciesTraits: event.target.value }))} rows={6} value={sheet.speciesTraits} /></label>
          <label className="form-field"><span>Background feature</span><textarea onChange={(event) => edit((current) => ({ ...current, backgroundFeature: event.target.value }))} rows={5} value={sheet.backgroundFeature} /></label>
          <label className="form-field level-up-field"><span>Feats <LevelUpHint /></span><textarea onChange={(event) => edit((current) => ({ ...current, feats: event.target.value }))} rows={5} value={sheet.feats} /></label>
          <label className="form-field full-width"><span>Special abilities</span><textarea onChange={(event) => edit((current) => ({ ...current, specialAbilities: event.target.value }))} rows={6} value={sheet.specialAbilities} /></label>
        </div>
      </article>

      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">During play</span><h2>Character notes</h2></div></div>
        <label className="form-field full-width"><span>Notes</span><textarea onChange={(event) => edit((current) => ({ ...current, notes: event.target.value }))} placeholder="Conditions, reminders, NPC names, session details..." rows={12} value={sheet.notes} /></label>
      </article>

      <SoulReaperSection characterId={characterId} characterLevel={character.level} />
      <InventorySection characterId={characterId} />
    </section>
  );
}
