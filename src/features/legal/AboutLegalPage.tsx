import { PageHeader } from "../../components/PageHeader";
import { SourceBadge } from "../../components/SourceBadge";
import { srdAttribution } from "../../legal/srdAttribution";

export function AboutLegalPage() {
  return (
    <section className="page legal-page">
      <PageHeader
        eyebrow="About / Legal"
        title="Rules Content and Attribution"
        description="Character Vault is local-first. The bundled rules helper data is intentionally limited to commercial-safe SRD foundation material."
        actions={<a className="secondary-button button-link" href="#settings">Settings</a>}
      />

      <div className="settings-stack">
        <article className="panel setting-section legal-section">
          <div>
            <h2>{srdAttribution.title}</h2>
            <p>{srdAttribution.text}</p>
            <p>{srdAttribution.ownership}</p>
            <p><a className="inline-link" href={srdAttribution.licenseUrl} rel="noreferrer" target="_blank">{srdAttribution.licenseName}</a></p>
          </div>
          <SourceBadge source="SRD" />
        </article>

        <article className="panel setting-section legal-section">
          <div>
            <h2>No endorsement</h2>
            <p>{srdAttribution.noEndorsement}</p>
            <p>{srdAttribution.compatibility}</p>
          </div>
          <span className="status-badge">Independent app</span>
        </article>

        <article className="panel setting-section legal-section">
          <div>
            <h2>Source labels</h2>
            <p>Rules-like entries may be labeled as SRD, Manual, Imported PDF, or Homebrew so you can tell where a note came from before trusting it at the table.</p>
          </div>
          <div className="source-badge-row">
            <SourceBadge source="SRD" />
            <SourceBadge source="Manual" />
            <SourceBadge source="Imported PDF" />
            <SourceBadge source="Homebrew" />
          </div>
        </article>
      </div>
    </section>
  );
}
