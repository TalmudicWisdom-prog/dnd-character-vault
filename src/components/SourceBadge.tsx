import type { RulesSource } from "../domain/models";
import { rulesSourceHelp, rulesSourceLabel } from "../rules/sources";

export function SourceBadge({ source }: { source: RulesSource }) {
  return <small className={`source-badge source-${source.toLowerCase().replace(/\s+/g, "-")}`} title={rulesSourceHelp[source]}>{rulesSourceLabel(source)}</small>;
}
