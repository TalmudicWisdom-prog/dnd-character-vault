import type { ConditionId } from "../../domain/models";

export type ConditionDefinition = {
  id: ConditionId;
  label: string;
  summary: string;
};

export const conditionDefinitions: readonly ConditionDefinition[] = [
  { id: "blinded", label: "Blinded", summary: "Cannot see; sight-based checks fail, and attacks are affected." },
  { id: "charmed", label: "Charmed", summary: "Cannot attack the charmer; the charmer has an edge in social interaction." },
  { id: "deafened", label: "Deafened", summary: "Cannot hear and fails checks that require hearing." },
  { id: "frightened", label: "Frightened", summary: "Disadvantaged while the source is visible and cannot willingly move closer." },
  { id: "grappled", label: "Grappled", summary: "Speed is 0 until the grapple ends." },
  { id: "incapacitated", label: "Incapacitated", summary: "Cannot take actions, bonus actions, or reactions." },
  { id: "invisible", label: "Invisible", summary: "Cannot be seen without special senses; attacks are affected." },
  { id: "paralyzed", label: "Paralyzed", summary: "Incapacitated and unable to move or speak; nearby hits can be critical." },
  { id: "petrified", label: "Petrified", summary: "Transformed into an inert substance and incapacitated." },
  { id: "poisoned", label: "Poisoned", summary: "Disadvantage on attack rolls and ability checks." },
  { id: "prone", label: "Prone", summary: "Movement is limited and attack rolls are affected by distance." },
  { id: "restrained", label: "Restrained", summary: "Speed is 0; attacks and Dexterity saves are affected." },
  { id: "stunned", label: "Stunned", summary: "Incapacitated, unable to move, and attacks against the creature have advantage." },
  { id: "unconscious", label: "Unconscious", summary: "Incapacitated, unaware, prone, and unable to move or speak." },
];

const conditionLabelById = new Map(conditionDefinitions.map((condition) => [condition.id, condition.label]));

export function conditionSummary(active: readonly ConditionId[], exhaustionLevel: number) {
  const labels = active.map((id) => conditionLabelById.get(id)).filter((label): label is string => Boolean(label));
  if (exhaustionLevel > 0) labels.push(`Exhaustion ${exhaustionLevel}`);
  if (!labels.length) return "Clear";
  if (labels.length <= 2) return labels.join(" · ");
  return `${labels.length} active`;
}

