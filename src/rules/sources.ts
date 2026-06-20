import type { RulesSource } from "../domain/models";

export const rulesSourceLabels: Record<RulesSource, string> = {
  SRD: "SRD",
  Manual: "Manual",
  "Imported PDF": "Imported PDF",
  Homebrew: "Homebrew",
};

export const rulesSourceHelp: Record<RulesSource, string> = {
  SRD: "Included from SRD 5.2.1 under CC BY 4.0.",
  Manual: "Typed or edited by you.",
  "Imported PDF": "Came from a user-selected local import and should be reviewed.",
  Homebrew: "Custom or table-specific content.",
};

export function rulesSourceLabel(source: RulesSource) {
  return rulesSourceLabels[source];
}
