import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { SourceBadge } from "../../components/SourceBadge";
import type { AbilityId, CharacterCreationDraft, CreationEquipmentItem, CreationMode, SkillId } from "../../domain/models";
import { abilityModifier, formatModifier, proficiencyBonusForLevel, skillModifier } from "../../domain/dndMath";
import { abilityIds, skillIds } from "../../storage/characterSheets";
import {
  createCharacterFromCreationDraft,
  getOrCreateCreationDraft,
  resetCreationDraft,
  saveCreationDraft,
} from "../../storage/characterCreation";
import { srdAbilities, srdBackgrounds, srdClass, srdClasses, srdSkill, srdSkills, srdSpecies } from "../../rules/srd";
import {
  clampPointBuyScore,
  isLegalPointBuy,
  pointBuyRemaining,
  rollSixAbilityScores,
  scoreIsAvailable,
  standardArrayScores,
} from "./abilityScoreSetup";
import { clampCreationStep, creationSteps, nextCreationStep, previousCreationStep } from "./createCharacterWizard";
import {
  canChooseSkill,
  classSavingThrowRecord,
  guidedReviewWarnings,
  modeLabel,
  selectedSkillCount,
  suggestedMaxHp,
} from "./creationMode";

const abilityLabels = Object.fromEntries(srdAbilities.map((ability) => [ability.id, ability.label])) as Record<AbilityId, string>;
const abilityShortLabels = Object.fromEntries(srdAbilities.map((ability) => [ability.id, ability.shortLabel])) as Record<AbilityId, string>;
const skillLabels = Object.fromEntries(srdSkills.map((skill) => [skill.id, skill.label])) as Record<SkillId, string>;
const skillAbilityLabels = Object.fromEntries(srdSkills.map((skill) => [skill.id, skill.ability])) as Record<SkillId, AbilityId>;

function LevelUpHint() {
  return <small className="level-up-hint">Usually changed during level up.</small>;
}

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function fullAbilityScores(scores: Partial<Record<AbilityId, number>>, fallback = 10): Record<AbilityId, number> {
  return Object.fromEntries(abilityIds.map((ability) => [ability, scores[ability] ?? fallback])) as Record<AbilityId, number>;
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
      setDraft({ ...loaded, step: clampCreationStep(loaded.step) });
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
        sheet: {
          ...current.sheet,
          proficiencyBonus: current.creationMode === "guided" ? proficiencyBonusForLevel(level) : current.sheet.proficiencyBonus,
        },
      };
    });

  const updateSheet = <Key extends keyof CharacterCreationDraft["sheet"]>(key: Key, value: CharacterCreationDraft["sheet"][Key]) =>
    update((current) => ({ ...current, sheet: { ...current.sheet, [key]: value } }));

  const setCreationMode = (mode: CreationMode) => {
    if (!draft || draft.creationMode === mode) return;
    if (mode === "manual" && !window.confirm("Switch to Manual mode? Manual mode keeps your current draft, unlocks free entry, and may allow nonstandard character choices.")) return;
    if (mode === "guided" && !window.confirm("Switch to Guided mode? Your current draft stays intact, and the wizard will show SRD-based helpers and warnings.")) return;
    update((current) => ({
      ...current,
      creationMode: mode,
      sheet: mode === "guided"
        ? { ...current.sheet, proficiencyBonus: proficiencyBonusForLevel(current.character.level) }
        : current.sheet,
    }));
  };

  const chooseInitialCreationMode = (mode: CreationMode) =>
    update((current) => ({
      ...current,
      creationMode: mode,
      abilityScoreSetup: mode === "manual" ? { ...current.abilityScoreSetup, mode: "manual" } : current.abilityScoreSetup,
      sheet: mode === "guided"
        ? { ...current.sheet, proficiencyBonus: proficiencyBonusForLevel(current.character.level) }
        : current.sheet,
    }));

  const setAbilitySetupMode = (mode: "guided" | "manual") =>
    update((current) => ({ ...current, abilityScoreSetup: { ...current.abilityScoreSetup, mode } }));

  const setGuidedAbilityMethod = (guidedMethod: "standardArray" | "pointBuy" | "rollDice") =>
    update((current) => ({
      ...current,
      abilityScoreSetup: { ...current.abilityScoreSetup, mode: "guided", guidedMethod },
      sheet: guidedMethod === "pointBuy" ? { ...current.sheet, abilityScores: fullAbilityScores({}, 8) } : current.sheet,
    }));

  const assignStandardArrayScore = (ability: AbilityId, scoreText: string) =>
    update((current) => {
      const score = scoreText ? Number(scoreText) : null;
      const standardArrayAssignments = { ...current.abilityScoreSetup.standardArrayAssignments, [ability]: score };
      return {
        ...current,
        abilityScoreSetup: { ...current.abilityScoreSetup, standardArrayAssignments },
        sheet: score == null ? current.sheet : { ...current.sheet, abilityScores: { ...current.sheet.abilityScores, [ability]: score } },
      };
    });

  const assignRolledScore = (ability: AbilityId, scoreText: string) =>
    update((current) => {
      const score = scoreText ? Number(scoreText) : null;
      const rolledAssignments = { ...current.abilityScoreSetup.rolledAssignments, [ability]: score };
      return {
        ...current,
        abilityScoreSetup: { ...current.abilityScoreSetup, rolledAssignments },
        sheet: score == null ? current.sheet : { ...current.sheet, abilityScores: { ...current.sheet.abilityScores, [ability]: score } },
      };
    });

  const rollAbilityScores = () =>
    update((current) => ({
      ...current,
      abilityScoreSetup: { ...current.abilityScoreSetup, mode: "guided", guidedMethod: "rollDice", rolledScores: rollSixAbilityScores(), rolledAssignments: {} },
    }));

  const setPointBuyScore = (ability: AbilityId, requestedScore: number) =>
    update((current) => {
      const score = clampPointBuyScore(requestedScore);
      const nextScores = { ...fullAbilityScores(current.sheet.abilityScores, 8), [ability]: score };
      if (!isLegalPointBuy(nextScores)) return current;
      return {
        ...current,
        abilityScoreSetup: { ...current.abilityScoreSetup, mode: "guided", guidedMethod: "pointBuy" },
        sheet: { ...current.sheet, abilityScores: nextScores },
      };
    });

  const setStep = (step: number) => update((current) => ({ ...current, step: clampCreationStep(step) }));

  const saveNow = async () => {
    if (!draft) return;
    const saved = await saveCreationDraft(draft);
    setDraft(saved);
    setStatus("Draft saved locally");
  };

  const skipForNow = () => {
    dirtyVersion.current += 1;
    setDraft((current) => current ? { ...current, step: nextCreationStep(current.step) } : current);
    setStatus("Skipped for now. Draft saved locally.");
  };

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
    if (!draft || draft.step !== creationSteps.length - 1) {
      setStatus("Review the character first, then press Create Character.");
      return;
    }
    if (!canCreate) {
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

  const step = clampCreationStep(draft.step);
  const sheet = draft.sheet;
  const character = draft.character;
  const abilitySetup = draft.abilityScoreSetup;
  const allAbilitiesAreDefault = abilityIds.every((ability) => (sheet.abilityScores[ability] ?? 10) === 10);
  const selectedClass = srdClass(character.characterClass);
  const selectedSpecies = srdSpecies.find((species) => species.name === character.ancestry);
  const selectedBackground = srdBackgrounds.find((background) => background.name === character.background);
  const classDescription = selectedClass?.description ?? (character.characterClass ? "Custom class. You can enter or edit the details yourself." : "Pick an SRD class, or type a custom/homebrew class.");
  const speciesDescription = selectedSpecies?.description ?? (character.ancestry ? "Custom ancestry/species. You can keep the name here and fill in traits later." : "Pick an SRD species/ancestry, or type a custom/homebrew one.");
  const backgroundDescription = selectedBackground?.description ?? (character.background ? `${character.background} is saved as this character's origin. You can add the feature and story details later.` : "Choose an SRD background/origin, or type your own.");
  const isGuided = draft.creationMode === "guided";
  const isManual = draft.creationMode === "manual";
  const abilityEntryIsManual = isManual || abilitySetup.mode === "manual";
  const skillChoiceLimit = selectedClass?.skillChoiceCount ?? skillIds.length;
  const currentSkillCount = selectedSkillCount(sheet.skillProficiencies);
  const reviewWarnings = guidedReviewWarnings(draft, selectedClass);
  const suggestedHp = selectedClass ? suggestedMaxHp(character.level ?? 1, selectedClass.hitDie, sheet.abilityScores.con ?? 10) : null;
  const skipLabel = step === 7 ? "Skip for now: keep default 10s" : "Skip for now";
  const currentProficiencyBonus = proficiencyBonusForLevel(character.level ?? 1);
  const effectiveProficiencyBonus = isGuided ? currentProficiencyBonus : sheet.proficiencyBonus;
  const pointBuyScores = fullAbilityScores(sheet.abilityScores, 8);
  const pointBuyPointsLeft = pointBuyRemaining(pointBuyScores);
  const recommendedAbilities = selectedClass?.primaryAbilities ?? [];

  return (
    <section className="page create-character-page">
      <PageHeader
        eyebrow="Guided creation"
        title="Create Character"
        description="Choose manual creation step by step, or import a character from PDFs and photos."
        actions={<div className="header-action-group"><a className="secondary-button button-link" href="#import">Import Character</a><a className="secondary-button button-link" href="#characters">Back</a></div>}
      />

      <div className="creation-layout">
        <aside className="panel creation-steps" aria-label="Character creation steps">
          {creationSteps.map((label, index) => (
            <button className={step === index ? "creation-step active" : "creation-step"} key={label} onClick={() => setStep(index)} type="button">
              <span>{index + 1}</span>{label}
            </button>
          ))}
          <button className="text-button danger" onClick={() => void startOver()} type="button">Clear saved draft</button>
        </aside>

        <article className="panel creation-panel">
          <div className="form-section-heading">
            <div><span className="card-label">Step {step + 1} of {creationSteps.length}</span><h2>{creationSteps[step]}</h2></div>
            <div className="creation-status-actions">
              <span className={isGuided ? "save-state mode-pill guided" : "save-state mode-pill manual"}>Mode: {modeLabel(draft.creationMode)}</span>
              <button className="secondary-button compact" onClick={() => setCreationMode(isGuided ? "manual" : "guided")} type="button">
                Switch to {isGuided ? "Manual" : "Guided"}
              </button>
              <span className="save-state">{status}</span>
              <button className="secondary-button compact" onClick={() => void saveNow()} type="button">Save Draft</button>
            </div>
          </div>

          {step === 0 && <div className="form-grid">
            <article className="choice-explainer full-width">
              <h3>How would you like to create this character?</h3>
              <p>Guided mode coaches you through the usual SRD-based choices and points out incomplete or unusual entries. Manual mode is faster and looser for experienced players, homebrew, or DM-approved exceptions.</p>
            </article>
            <div className="ability-method-grid full-width">
              <button className={isGuided ? "method-card active" : "method-card"} onClick={() => chooseInitialCreationMode("guided")} type="button">
                <strong>Guide me</strong>
                <span>Best for newer players. Shows explanations, suggested class abilities, proficiency guidance, and review warnings.</span>
              </button>
              <button className={isManual ? "method-card active" : "method-card"} onClick={() => chooseInitialCreationMode("manual")} type="button">
                <strong>Manual mode</strong>
                <span>Best when you already know what to enter. Keeps helper text light and allows nonstandard table-approved values.</span>
              </button>
            </div>
            <p className="inline-message full-width">You can switch modes later without losing draft data. Manual mode may allow choices the app cannot verify against SRD guidance.</p>
          </div>}

          {step === 1 && <div className="form-grid">
            <label className="form-field"><span>Character name *</span><input autoFocus maxLength={100} onChange={(event) => updateCharacter("name", event.target.value)} value={character.name} /></label>
            <label className="form-field"><span>Player name</span><input maxLength={100} onChange={(event) => updateCharacter("playerName", event.target.value)} value={character.playerName ?? ""} /></label>
            <label className="form-field"><span>Campaign</span><input maxLength={100} onChange={(event) => updateCharacter("campaign", event.target.value)} value={character.campaign ?? ""} /></label>
            <label className="form-field level-up-field"><span>Level * <LevelUpHint /></span><input max={20} min={1} onChange={(event) => updateCharacter("level", Number(event.target.value))} type="number" value={character.level ?? 1} /></label>
            <p className="inline-message full-width">SRD helper: a level {character.level || 1} character has a proficiency bonus of <strong>{formatModifier(currentProficiencyBonus)}</strong>. {isGuided ? "Guided mode keeps this calculated." : "Manual mode lets you override it later."}</p>
            <p className="inline-message full-width">You can move forward with blanks, but the final Create button requires name, class, species/ancestry, and level.</p>
          </div>}

          {step === 2 && <div className="choice-step">
            <div className="form-grid">
              <label className="form-field"><span>Choose class *</span><select onChange={(event) => updateCharacter("characterClass", event.target.value)} value={srdClasses.some((option) => option.name === character.characterClass) ? character.characterClass : ""}><option value="">Choose or type below</option>{srdClasses.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}<option value="Custom / Homebrew">Custom / Homebrew</option></select></label>
              <label className="form-field"><span>Custom class</span><input maxLength={100} onChange={(event) => updateCharacter("characterClass", event.target.value)} placeholder="Soul Reaper, Gunbreaker, Blood Mage..." value={character.characterClass ?? ""} /></label>
            </div>
            <article className="choice-explainer">
              <h3>{character.characterClass || "Class"} {selectedClass ? <SourceBadge source={selectedClass.source} /> : character.characterClass ? <SourceBadge source="Homebrew" /> : null}</h3>
              <p>{classDescription}</p>
              {selectedClass && <>
                <p><strong>Primary ability:</strong> {selectedClass.primaryAbilities.map((ability) => abilityLabels[ability]).join(" or ")}</p>
                {isGuided && <p><strong>Guided helper:</strong> Hit Die d{selectedClass.hitDie}, saving throws {selectedClass.savingThrows.map((ability) => abilityLabels[ability]).join(" and ")}, choose about {selectedClass.skillChoiceCount} class skills. Complexity: {selectedClass.complexity}.</p>}
              </>}
              <p className="inline-message">{isGuided ? "SRD help is guidance only. Required before final creation, and you can still type a custom class." : "Manual mode accepts any class name and will not enforce SRD class limits."}</p>
            </article>
          </div>}

          {step === 3 && <div className="choice-step">
            <div className="form-grid">
              <label className="form-field"><span>Choose species / ancestry *</span><select onChange={(event) => updateCharacter("ancestry", event.target.value)} value={srdSpecies.some((option) => option.name === character.ancestry) ? character.ancestry : ""}><option value="">Choose or type below</option>{srdSpecies.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}<option value="Custom / Homebrew">Custom / Homebrew</option></select></label>
              <label className="form-field"><span>Custom species / ancestry</span><input maxLength={100} onChange={(event) => updateCharacter("ancestry", event.target.value)} placeholder="Shadar-kai, Viera, awakened construct..." value={character.ancestry ?? ""} /></label>
            </div>
            <article className="choice-explainer">
              <h3>{character.ancestry || "Species / Ancestry"} {selectedSpecies ? <SourceBadge source={selectedSpecies.source} /> : character.ancestry ? <SourceBadge source="Homebrew" /> : null}</h3>
              <p>{speciesDescription}</p>
              {isGuided && selectedSpecies?.traits?.length ? <p><strong>SRD traits:</strong> {selectedSpecies.traits.join(", ")}</p> : null}
              <p className="inline-message">{isGuided ? "SRD names here are helper data. Traits can be filled in on the Features step or later on the sheet." : "Manual mode accepts any ancestry/species name and does not enforce SRD traits."}</p>
            </article>
          </div>}

          {step === 4 && <div className="choice-step">
            <div className="form-grid">
              <label className="form-field"><span>Choose background / origin</span><select onChange={(event) => updateCharacter("background", event.target.value)} value={srdBackgrounds.some((option) => option.name === character.background) ? character.background ?? "" : ""}><option value="">Choose or type below</option>{srdBackgrounds.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}<option value="Custom / Homebrew">Custom / Homebrew</option></select></label>
              <label className="form-field"><span>Custom origin</span><input maxLength={100} onChange={(event) => updateCharacter("background", event.target.value)} placeholder="Exiled guard, lab survivor, skyship orphan..." value={character.background ?? ""} /></label>
            </div>
            <article className="choice-explainer">
              <h3>{character.background || "Background / Origin"} {selectedBackground ? <SourceBadge source={selectedBackground.source} /> : character.background ? <SourceBadge source="Homebrew" /> : null}</h3>
              <p>{backgroundDescription}</p>
              {isGuided && selectedBackground?.skills?.length ? <p><strong>Suggested skills:</strong> {selectedBackground.skills.map((skill) => skillLabels[skill]).join(", ")}</p> : null}
              {isGuided && selectedBackground?.abilitySuggestions?.length ? <p><strong>Ability ideas:</strong> {selectedBackground.abilitySuggestions.map((ability) => abilityLabels[ability]).join(" or ")}</p> : null}
              <p className="inline-message">{isGuided ? "Optional for now. Guided mode will flag missing essentials later, but background can stay blank." : "Manual mode lets you type any origin or leave it for later."}</p>
            </article>
          </div>}

          {step === 5 && <div className="form-grid">
            {isGuided && <article className="choice-explainer full-width">
              <h3>Concept prompts</h3>
              <p>Try one sentence for who they are, one sentence for what they want, and one sentence for what might get them into trouble.</p>
            </article>}
            <label className="form-field full-width"><span>Concept</span><input maxLength={500} onChange={(event) => updateCharacter("concept", event.target.value)} placeholder="Undead hunter, reluctant royal heir, sky pirate medic..." value={character.concept ?? ""} /></label>
            <label className="form-field full-width"><span>Personality</span><textarea onChange={(event) => updateCharacter("personalityNotes", event.target.value)} rows={4} value={character.personalityNotes ?? ""} /></label>
            <label className="form-field full-width"><span>Backstory</span><textarea onChange={(event) => updateCharacter("backstory", event.target.value)} rows={8} value={character.backstory ?? ""} /></label>
            <label className="form-field"><span>Goals</span><textarea onChange={(event) => updateCharacter("goals", event.target.value)} rows={5} value={character.goals ?? ""} /></label>
            <label className="form-field"><span>Roleplay notes</span><textarea onChange={(event) => updateCharacter("roleplayNotes", event.target.value)} rows={5} value={character.roleplayNotes ?? ""} /></label>
          </div>}

          {step === 6 && <div className="ability-score-setup">
            <section className="choice-explainer">
              <h3>What are ability scores?</h3>
              <p>Ability scores are the six core numbers that describe what your character is naturally good at: Strength, Dexterity, Constitution, Intelligence, Wisdom, and Charisma.</p>
              <p>They matter because they create modifiers like +2 or -1, and those modifiers affect attacks, skills, saving throws, spellcasting, and many table rulings.</p>
              {selectedClass && <p><strong>{selectedClass.name} recommendation:</strong> Primary Ability: {recommendedAbilities.map((ability) => abilityLabels[ability]).join(" or ")}.</p>}
            </section>

            <div className="ability-method-grid">
              <button className={!abilityEntryIsManual ? "method-card active" : "method-card"} disabled={isManual} onClick={() => setAbilitySetupMode("guided")} type="button">
                <strong>Guided</strong>
                <span>Recommended for new players. Choose Standard Array, Point Buy, or Roll Dice.</span>
              </button>
              <button className={abilityEntryIsManual ? "method-card active" : "method-card"} onClick={() => setAbilitySetupMode("manual")} type="button">
                <strong>Manual Entry</strong>
                <span>Fastest for experienced users. Type any table-approved values directly.</span>
              </button>
            </div>

            {isManual && <p className="inline-message">Manual creation mode uses direct ability entry on the next step. Switch to Guided mode if you want Standard Array, Point Buy, or Roll Dice coaching.</p>}

            {!abilityEntryIsManual && <div className="guided-methods">
              <h3>Choose a guided method</h3>
              <div className="ability-method-grid">
                <button className={abilitySetup.guidedMethod === "standardArray" ? "method-card active" : "method-card"} onClick={() => setGuidedAbilityMethod("standardArray")} type="button">
                  <strong>Standard Array</strong>
                  <span>Use the fixed legal set: 15, 14, 13, 12, 10, 8. Assign each number once.</span>
                </button>
                <button className={abilitySetup.guidedMethod === "pointBuy" ? "method-card active" : "method-card"} onClick={() => setGuidedAbilityMethod("pointBuy")} type="button">
                  <strong>Point Buy</strong>
                  <span>Start at 8 in every ability, then spend 27 points. Scores stay between 8 and 15.</span>
                </button>
                <button className={abilitySetup.guidedMethod === "rollDice" ? "method-card active" : "method-card"} onClick={() => setGuidedAbilityMethod("rollDice")} type="button">
                  <strong>Roll Dice</strong>
                  <span>Roll 4d6, drop the lowest die, repeat six times, then assign the results.</span>
                </button>
              </div>
              <p className="inline-message">Your DM may prefer one method. When in doubt, ask them. This vault keeps everything editable.</p>
            </div>}
          </div>}

          {step === 7 && <div className="ability-step">
            <p className="inline-message">Ability scores start as <strong>Default placeholder: 10</strong>. Change them manually now, or skip and keep those placeholders until you edit the sheet later.</p>
            {selectedClass && <p className="inline-message">{selectedClass.name} usually wants <strong>{recommendedAbilities.map((ability) => abilityLabels[ability]).join(" or ")}</strong> to be strong.</p>}

            {!abilityEntryIsManual && abilitySetup.guidedMethod === "standardArray" && <div className="assignment-panel">
              <div className="form-section-heading"><div><span className="card-label">Standard Array</span><h3>Assign 15, 14, 13, 12, 10, 8</h3><p>Each number can be used once. Pick where each score goes.</p></div></div>
              <div className="ability-assignment-grid">
                {abilityIds.map((ability) => {
                  const assigned = abilitySetup.standardArrayAssignments[ability] ?? null;
                  const score = sheet.abilityScores[ability] ?? assigned ?? 10;
                  return <label className="form-field" key={ability}><span>{abilityLabels[ability]} {recommendedAbilities.includes(ability) && <small>Class pick</small>}</span><select onChange={(event) => assignStandardArrayScore(ability, event.target.value)} value={assigned ?? ""}><option value="">Choose score</option>{standardArrayScores.map((value, index) => <option disabled={!scoreIsAvailable(value, standardArrayScores, abilitySetup.standardArrayAssignments, ability)} key={`${value}-${index}`} value={value}>{value}</option>)}</select><small>Modifier {formatModifier(abilityModifier(score))}</small></label>;
                })}
              </div>
            </div>}

            {!abilityEntryIsManual && abilitySetup.guidedMethod === "pointBuy" && <div className="assignment-panel">
              <div className="form-section-heading"><div><span className="card-label">Point Buy</span><h3>{pointBuyPointsLeft} points remaining</h3><p>Scores must stay between 8 and 15. The app prevents spending more than 27 points.</p></div></div>
              <div className="ability-grid creation-ability-grid">
                {abilityIds.map((ability) => {
                  const score = pointBuyScores[ability];
                  const canIncrease = isLegalPointBuy({ ...pointBuyScores, [ability]: Math.min(15, score + 1) }) && score < 15;
                  return <label className="ability-card level-up-field" key={ability}><span>{abilityLabels[ability]} {recommendedAbilities.includes(ability) && <small>Class pick</small>}</span><strong>{formatModifier(abilityModifier(score))}</strong><input max={15} min={8} onChange={(event) => setPointBuyScore(ability, Number(event.target.value))} type="number" value={score} /><div className="score-button-row"><button disabled={score <= 8} onClick={() => setPointBuyScore(ability, score - 1)} type="button">-</button><button disabled={!canIncrease} onClick={() => setPointBuyScore(ability, score + 1)} type="button">+</button></div><LevelUpHint /></label>;
                })}
              </div>
            </div>}

            {!abilityEntryIsManual && abilitySetup.guidedMethod === "rollDice" && <div className="assignment-panel">
              <div className="form-section-heading"><div><span className="card-label">Roll Dice</span><h3>4d6, drop the lowest</h3><p>Roll six scores, then assign each generated number once.</p></div><button className="secondary-button" onClick={rollAbilityScores} type="button">{abilitySetup.rolledScores.length ? "Roll again" : "Roll scores"}</button></div>
              {abilitySetup.rolledScores.length ? <><div className="review-pill-row">{abilitySetup.rolledScores.map((score, index) => <span key={`${score}-${index}`}>{score}</span>)}</div><div className="ability-assignment-grid">
                {abilityIds.map((ability) => {
                  const assigned = abilitySetup.rolledAssignments[ability] ?? null;
                  const score = sheet.abilityScores[ability] ?? assigned ?? 10;
                  return <label className="form-field" key={ability}><span>{abilityLabels[ability]} {recommendedAbilities.includes(ability) && <small>Class pick</small>}</span><select onChange={(event) => assignRolledScore(ability, event.target.value)} value={assigned ?? ""}><option value="">Choose roll</option>{abilitySetup.rolledScores.map((value, index) => <option disabled={!scoreIsAvailable(value, abilitySetup.rolledScores, abilitySetup.rolledAssignments, ability)} key={`${value}-${index}`} value={value}>{value}</option>)}</select><small>Modifier {formatModifier(abilityModifier(score))}</small></label>;
                })}
              </div></> : <div className="spell-empty compact-empty"><strong>No rolls yet</strong><span>Tap Roll scores to generate six offline rolls on this device.</span></div>}
            </div>}

            {abilityEntryIsManual && <div className="ability-grid creation-ability-grid">
              {abilityIds.map((ability) => {
                const score = sheet.abilityScores[ability] ?? 10;
                const abilityInfo = srdAbilities.find((item) => item.id === ability);
                return <label className="ability-card level-up-field" key={ability}><span>{abilityLabels[ability]} {abilityInfo && <SourceBadge source={abilityInfo.source} />}</span><strong>{formatModifier(abilityModifier(score))}</strong><input min={1} max={30} onChange={(event) => updateSheet("abilityScores", { ...sheet.abilityScores, [ability]: Number(event.target.value) })} type="number" value={score} />{abilityInfo && <small>{abilityInfo.description}</small>}{score === 10 && <small>Default placeholder: 10</small>}<LevelUpHint /></label>;
              })}
            </div>}
          </div>}

          {step === 8 && <div className="proficiency-grid creation-proficiency-grid">
            <article>
              <h3>Proficiency bonus <span className="level-up-hint">Usually changed during level up.</span></h3>
              <label className="big-stat"><span>Bonus</span><input disabled={isGuided} min={2} max={6} onChange={(event) => updateSheet("proficiencyBonus", Number(event.target.value))} type="number" value={effectiveProficiencyBonus} /></label>
              <p className="inline-message">{isGuided ? `Guided mode calculates this from level ${character.level}.` : "Manual mode lets you override proficiency bonus for homebrew or table exceptions."}</p>
              <h3>Saving throw proficiencies</h3>
              {isGuided && selectedClass && <button className="secondary-button compact" onClick={() => updateSheet("savingThrows", classSavingThrowRecord(sheet.savingThrows, selectedClass))} type="button">Apply {selectedClass.name} saves</button>}
              {isGuided && selectedClass && <p className="inline-message">SRD helper: {selectedClass.name} usually has {selectedClass.savingThrows.map((ability) => abilityLabels[ability]).join(" and ")} saving throw proficiencies.</p>}
              <div className="check-list">{abilityIds.map((ability) => <label className="proficiency-row" key={ability}><input checked={sheet.savingThrows[ability] ?? false} onChange={(event) => updateSheet("savingThrows", { ...sheet.savingThrows, [ability]: event.target.checked })} type="checkbox" /><span>{abilityLabels[ability]}</span><small>{formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10) + (sheet.savingThrows[ability] ? effectiveProficiencyBonus : 0))}</small></label>)}</div>
            </article>
            <article>
              <h3>Skill proficiencies</h3>
              {isGuided && selectedClass && <p className="inline-message">Choose about <strong>{selectedClass.skillChoiceCount}</strong> class skills. Selected: <strong>{currentSkillCount}</strong> of {selectedClass.skillChoiceCount}.</p>}
              <div className="check-list skills-list">{skillIds.map((skill) => {
                const skillInfo = srdSkill(skill);
                return <label className="proficiency-row skill-helper-row" key={skill}><input checked={sheet.skillProficiencies[skill] ?? false} onChange={(event) => {
                  if (event.target.checked && !canChooseSkill(sheet.skillProficiencies, skill, skillChoiceLimit, isGuided)) {
                    setStatus(`Guided mode limit reached: ${skillChoiceLimit} class skills. Switch to Manual mode for exceptions.`);
                    return;
                  }
                  updateSheet("skillProficiencies", { ...sheet.skillProficiencies, [skill]: event.target.checked });
                }} type="checkbox" /><span>{skillLabels[skill]}{skillInfo && <small>{skillInfo.description}</small>}</span><small>{abilityShortLabels[skillAbilityLabels[skill]]} {formatModifier(skillModifier(sheet, skill))}</small></label>;
              })}</div>
            </article>
          </div>}

          {step === 9 && <div className="form-grid">
            {isGuided && selectedClass && <article className="choice-explainer full-width">
              <h3>Combat helper</h3>
              <p>{selectedClass.name} uses a d{selectedClass.hitDie} Hit Die in the SRD helper data. Based on level {character.level} and CON {sheet.abilityScores.con ?? 10}, a simple average HP suggestion is <strong>{suggestedHp}</strong>.</p>
              <button className="secondary-button compact" onClick={() => updateSheet("maxHp", suggestedHp ?? sheet.maxHp)} type="button">Use suggested Max HP</button>
            </article>}
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

          {step === 10 && <div className="creation-equipment-list">
            <p className="inline-message">Optional starter equipment. You can skip this and use the full inventory tools after creation.</p>
            <button className="secondary-button" onClick={addEquipment} type="button">Add equipment item</button>
            {draft.equipment.map((item) => <article className="creation-equipment-row" key={item.id}>
              <label className="form-field"><span>Item name</span><input onChange={(event) => updateEquipment(item.id, { name: event.target.value })} value={item.name} /></label>
              <label className="form-field"><span>Quantity</span><input min={0} onChange={(event) => updateEquipment(item.id, { quantity: Number(event.target.value) })} type="number" value={item.quantity} /></label>
              <label className="touch-toggle"><input checked={item.equipped} onChange={(event) => updateEquipment(item.id, { equipped: event.target.checked })} type="checkbox" /><span>Equipped</span></label>
              <label className="form-field full-width"><span>Notes</span><textarea onChange={(event) => updateEquipment(item.id, { notes: event.target.value })} rows={3} value={item.notes} /></label>
              <button className="text-button danger" onClick={() => removeEquipment(item.id)} type="button">Remove</button>
            </article>)}
          </div>}

          {step === 11 && <div className="form-grid">
            {isGuided && selectedClass?.spellcastingAbility && <article className="choice-explainer full-width">
              <h3>Spellcasting helper</h3>
              <p>{selectedClass.name} usually casts with <strong>{abilityLabels[selectedClass.spellcastingAbility]}</strong>. Spell slots still stay manual for now.</p>
              <button className="secondary-button compact" onClick={() => updateSheet("spellcastingAbility", selectedClass.spellcastingAbility ?? null)} type="button">Use {abilityLabels[selectedClass.spellcastingAbility]}</button>
            </article>}
            {isGuided && selectedClass && !selectedClass.spellcastingAbility && <p className="inline-message full-width">{selectedClass.name} does not have a basic spellcasting ability in this SRD helper layer. You can still enter spells manually if your table grants them.</p>}
            <label className="form-field"><span>Spellcasting ability</span><select onChange={(event) => updateSheet("spellcastingAbility", event.target.value ? event.target.value as AbilityId : null)} value={sheet.spellcastingAbility ?? ""}><option value="">None / not set</option>{abilityIds.map((ability) => <option key={ability} value={ability}>{abilityLabels[ability]}</option>)}</select></label>
            <label className="form-field"><span>Spell save DC</span><input min={0} onChange={(event) => updateSheet("spellSaveDc", Number(event.target.value))} type="number" value={sheet.spellSaveDc} /></label>
            <label className="form-field"><span>Spell attack bonus</span><input onChange={(event) => updateSheet("spellAttackBonus", Number(event.target.value))} type="number" value={sheet.spellAttackBonus} /></label>
            <label className="form-field level-up-field"><span>Spell slots <LevelUpHint /></span><div className="slot-grid">{spellSlotLevels.map((level) => <label key={level}><small>L{level}</small><input min={0} onChange={(event) => updateSheet("spellSlots", { ...sheet.spellSlots, [level]: Number(event.target.value) })} type="number" value={sheet.spellSlots[level] ?? 0} /></label>)}</div></label>
            <label className="form-field"><span>Cantrips</span><textarea onChange={(event) => updateSheet("cantrips", event.target.value)} placeholder="One per line" rows={6} value={sheet.cantrips} /></label>
            <label className="form-field"><span>Prepared spells</span><textarea onChange={(event) => updateSheet("preparedSpells", event.target.value)} placeholder="One per line" rows={6} value={sheet.preparedSpells} /></label>
            <label className="form-field full-width"><span>Spell notes</span><textarea onChange={(event) => updateSheet("spellNotes", event.target.value)} rows={5} value={sheet.spellNotes} /></label>
          </div>}

          {step === 12 && <div className="form-grid">
            <label className="form-field level-up-field"><span>Class features <LevelUpHint /></span><textarea onChange={(event) => updateSheet("classFeatures", event.target.value)} rows={7} value={sheet.classFeatures} /></label>
            <label className="form-field"><span>Species traits</span><textarea onChange={(event) => updateSheet("speciesTraits", event.target.value)} rows={7} value={sheet.speciesTraits} /></label>
            <label className="form-field"><span>Background feature</span><textarea onChange={(event) => updateSheet("backgroundFeature", event.target.value)} rows={5} value={sheet.backgroundFeature} /></label>
            <label className="form-field level-up-field"><span>Feats <LevelUpHint /></span><textarea onChange={(event) => updateSheet("feats", event.target.value)} rows={5} value={sheet.feats} /></label>
            <label className="form-field"><span>Armor proficiencies</span><textarea onChange={(event) => updateSheet("armorProficiencies", event.target.value)} rows={4} value={sheet.armorProficiencies} /></label>
            <label className="form-field"><span>Weapon proficiencies</span><textarea onChange={(event) => updateSheet("weaponProficiencies", event.target.value)} rows={4} value={sheet.weaponProficiencies} /></label>
            <label className="form-field"><span>Tool proficiencies</span><textarea onChange={(event) => updateSheet("toolProficiencies", event.target.value)} rows={4} value={sheet.toolProficiencies} /></label>
            <label className="form-field"><span>Languages</span><textarea onChange={(event) => updateSheet("languages", event.target.value)} rows={4} value={sheet.languages} /></label>
            <label className="form-field full-width"><span>Special abilities</span><textarea onChange={(event) => updateSheet("specialAbilities", event.target.value)} rows={6} value={sheet.specialAbilities} /></label>
          </div>}

          {step === 13 && <div className="review-stack">
            <section>
              <h3>Creation mode</h3>
              <p>{modeLabel(draft.creationMode)} mode</p>
              {isGuided && reviewWarnings.length > 0 && <div className="inline-message">
                <strong>Needs review before play:</strong>
                <ul>
                  {reviewWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>}
              {isManual && <p className="inline-message">Manual mode does not enforce SRD legality. Review any homebrew or table-specific choices with your DM.</p>}
            </section>
            <section><h3>Required details</h3><p><strong>{character.name || "Unnamed"}</strong> · Level {character.level} {character.characterClass || "Class missing"} · {character.ancestry || "Ancestry missing"}</p>{!canCreate && <p className="inline-message">Name, class, species/ancestry, and level are required before creating.</p>}</section>
            <section><h3>Origin and concept</h3><p>{character.background || "No background"} · {character.concept || "No concept yet"}</p><p>{character.backstory || "No backstory yet."}</p></section>
            <section><h3>Abilities</h3>{allAbilitiesAreDefault && <p className="inline-message">All ability scores are still using <strong>Default placeholder: 10</strong>.</p>}<div className="review-pill-row">{abilityIds.map((ability) => <span key={ability}>{abilityLabels[ability].slice(0, 3)} {sheet.abilityScores[ability]} ({formatModifier(abilityModifier(sheet.abilityScores[ability] ?? 10))})</span>)}</div></section>
            <section><h3>Combat</h3><p>AC {sheet.armorClass} · HP {sheet.currentHp}/{sheet.maxHp} · Speed {sheet.speed} · Hit Dice {sheet.hitDice || "not set"}</p></section>
            <section><h3>Equipment and spells</h3><p>{draft.equipment.filter((item) => item.name.trim()).length} equipment items · {lines(sheet.cantrips).length} cantrips · {lines(sheet.preparedSpells).length} prepared spells</p></section>
          </div>}

          <div className="creation-nav">
            <button className="secondary-button" disabled={step === 0} onClick={() => setStep(previousCreationStep(step))} type="button">Back</button>
            <div className="creation-nav-actions">
              {step > 2 && step < creationSteps.length - 1 && <button className="secondary-button" onClick={skipForNow} type="button">{skipLabel}</button>}
              {step < creationSteps.length - 1 ? <button className="primary-button" onClick={() => setStep(nextCreationStep(step))} type="button">Next</button> : <button className="primary-button" disabled={!canCreate || creating} onClick={() => void create()} type="button">Create Character</button>}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
