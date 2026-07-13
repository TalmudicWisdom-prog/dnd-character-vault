import type { RulesSource } from "../domain/models";
import { contentSource } from "../rules/contentSources";
import { rulesSourceHelp, rulesSourceLabel } from "../rules/sources";

export function SourceBadge({ source }: { source: RulesSource | string }) {
  const registered = contentSource(source);
  const legacySource = source as RulesSource;
  const label = registered?.shortLabel ?? rulesSourceLabel(legacySource);
  const help = registered?.help ?? rulesSourceHelp[legacySource];
  return <small className={`source-badge source-${source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} title={help}>{label}</small>;
}
