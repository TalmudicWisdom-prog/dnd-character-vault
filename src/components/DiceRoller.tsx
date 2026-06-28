import { useEffect, useState } from "react";
import { addRollToHistory, rollFormula, type DiceRollResult } from "../dice/dice";

const quickDice = ["d20", "d4", "d6", "d8", "d10", "d12", "d100"] as const;
const dieTypes = [4, 6, 8, 10, 12, 20, 100] as const;

type DiceRollerProps = {
  label?: string;
  context?: string;
  initialFormula?: string;
  compact?: boolean;
};

export function DiceRoller({ label = "Dice roller", context, initialFormula = "d20", compact = false }: DiceRollerProps) {
  const [formula, setFormula] = useState(initialFormula);
  const [diceCount, setDiceCount] = useState(1);
  const [dieType, setDieType] = useState<(typeof dieTypes)[number]>(20);
  const [modifier, setModifier] = useState(0);
  const [result, setResult] = useState<DiceRollResult | null>(null);
  const [history, setHistory] = useState<DiceRollResult[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setFormula(initialFormula);
  }, [initialFormula]);

  const roll = (nextFormula = formula) => {
    try {
      const rolled = rollFormula(nextFormula);
      setFormula(nextFormula);
      setResult(rolled);
      setHistory((current) => addRollToHistory(current, rolled));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not roll that formula");
    }
  };

  const rollBuiltFormula = () => {
    const built = `${Math.max(1, diceCount)}d${dieType}${modifier ? modifier > 0 ? `+${modifier}` : modifier : ""}`;
    roll(built);
  };

  return (
    <section className={compact ? "dice-roller compact-dice-roller" : "dice-roller"}>
      <div className="dice-roller-heading">
        <div><strong>{label}</strong>{context && <small>{context}</small>}</div>
        <span className="status-badge">Optional</span>
      </div>
      <div className="dice-controls">
        <label className="sr-only" htmlFor={`dice-${label.replace(/\W+/g, "-")}`}>Dice formula</label>
        <input id={`dice-${label.replace(/\W+/g, "-")}`} onChange={(event) => setFormula(event.target.value)} placeholder="2d6+3" value={formula} />
        <button className="primary-button compact" onClick={() => roll()} type="button">Roll</button>
      </div>
      <div className="dice-quick-buttons">
        {quickDice.map((die) => <button className="secondary-button compact" key={die} onClick={() => roll(die)} type="button">{die}</button>)}
      </div>
      <div className="dice-builder">
        <label><span>Number</span><input min={1} max={100} onChange={(event) => setDiceCount(Number(event.target.value))} type="number" value={diceCount} /></label>
        <label><span>Die</span><select onChange={(event) => setDieType(Number(event.target.value) as (typeof dieTypes)[number])} value={dieType}>{dieTypes.map((die) => <option key={die} value={die}>d{die}</option>)}</select></label>
        <label><span>Modifier</span><input onChange={(event) => setModifier(Number(event.target.value))} type="number" value={modifier} /></label>
        <button className="secondary-button compact" onClick={rollBuiltFormula} type="button">Roll built dice</button>
      </div>
      {error && <p className="inline-message" role="status">{error}</p>}
      {result && <div className="dice-result" role="status"><strong>{result.total}</strong><span>{result.breakdown}</span><small>Individual dice: {result.parts.flatMap((part) => part.rolls).join(", ") || "none"} · Modifier: {result.modifier}</small></div>}
      {history.length > 0 && <details className="dice-history"><summary>Roll history</summary><ol>{history.map((roll) => <li key={roll.id}><strong>{roll.formula}</strong> {roll.breakdown}</li>)}</ol></details>}
    </section>
  );
}
