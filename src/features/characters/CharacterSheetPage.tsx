import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { AbilityId, CharacterSheet, SkillId } from "../../domain/models";
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

const skillAbilities: Record<SkillId, AbilityId> = {
  acrobatics: "dex", animalHandling: "wis", arcana: "int", athletics: "str", deception: "cha",
  history: "int", insight: "wis", intimidation: "cha", investigation: "int", medicine: "wis",
  nature: "int", perception: "wis", performance: "cha", persuasion: "cha", religion: "int",
  sleightOfHand: "dex", stealth: "dex", survival: "wis",
};

function modifier(score: number) {
  const value = Math.floor((score - 10) / 2);
  return value >= 0 ? `+${value}` : `${value}`;
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

  if (loadError) return <section className="page"><div className="loading-state">Could not open character sheet: {loadError}</div></section>;
  if (!character || !sheet) return <section className="page"><div className="loading-state">Opening character sheet...</div></section>;

  return (
    <section className="page sheet-page">
      <PageHeader
        eyebrow="Play tools"
        title={character.name}
        description="A touch-friendly sheet for the details you reach for during play."
        actions={<div className="header-action-group"><a className="secondary-button button-link" href={`#character/${characterId}`}>Profile</a><a className="secondary-button button-link" href="#characters">Characters</a></div>}
      />

      <div className="sheet-status"><span className="status-dot" />{status}</div>

      <div className="play-grid">
        <article className="panel hp-panel">
          <div className="form-section-heading"><div><span className="card-label">Hit points</span><h2>Health</h2></div></div>
          <div className="hp-values">
            <label className="stat-field"><span>Current</span><input min={0} onChange={(event) => edit((current) => ({ ...current, currentHp: Number(event.target.value) }))} type="number" value={sheet.currentHp} /></label>
            <span className="hp-divider">/</span>
            <label className="stat-field"><span>Maximum</span><input min={0} onChange={(event) => edit((current) => ({ ...current, maxHp: Number(event.target.value) }))} type="number" value={sheet.maxHp} /></label>
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
        </article>
      </div>

      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">Core abilities</span><h2>Ability scores</h2></div></div>
        <div className="ability-grid">
          {abilityIds.map((ability) => (
            <label className="ability-card" key={ability}>
              <span>{abilityLabels[ability]}</span>
              <strong>{modifier(sheet.abilityScores[ability] ?? 10)}</strong>
              <input min={1} max={30} onChange={(event) => edit((current) => ({ ...current, abilityScores: { ...current.abilityScores, [ability]: Number(event.target.value) } }))} type="number" value={sheet.abilityScores[ability] ?? 10} />
            </label>
          ))}
        </div>
      </article>

      <div className="proficiency-grid">
        <article className="panel sheet-section">
          <div className="form-section-heading"><div><span className="card-label">Proficiencies</span><h2>Saving throws</h2></div></div>
          <div className="check-list">
            {abilityIds.map((ability) => <label className="proficiency-row" key={ability}><input checked={sheet.savingThrows[ability] ?? false} onChange={(event) => edit((current) => ({ ...current, savingThrows: { ...current.savingThrows, [ability]: event.target.checked } }))} type="checkbox" /><span>{abilityLabels[ability]}</span><small>{modifier(sheet.abilityScores[ability] ?? 10)}</small></label>)}
          </div>
        </article>
        <article className="panel sheet-section">
          <div className="form-section-heading"><div><span className="card-label">Proficiencies</span><h2>Skills</h2></div></div>
          <div className="check-list skills-list">
            {skillIds.map((skill) => <label className="proficiency-row" key={skill}><input checked={sheet.skillProficiencies[skill] ?? false} onChange={(event) => edit((current) => ({ ...current, skillProficiencies: { ...current.skillProficiencies, [skill]: event.target.checked } }))} type="checkbox" /><span>{skillLabels[skill]}</span><small>{abilityLabels[skillAbilities[skill]]}</small></label>)}
          </div>
        </article>
      </div>

      <article className="panel sheet-section">
        <div className="form-section-heading"><div><span className="card-label">During play</span><h2>Character notes</h2></div></div>
        <label className="form-field full-width"><span>Notes</span><textarea onChange={(event) => edit((current) => ({ ...current, notes: event.target.value }))} placeholder="Conditions, reminders, NPC names, session details..." rows={12} value={sheet.notes} /></label>
      </article>

      <SoulReaperSection characterId={characterId} characterLevel={character.level} />
      <InventorySection characterId={characterId} />
    </section>
  );
}
