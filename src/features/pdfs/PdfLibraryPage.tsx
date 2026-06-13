import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import { db } from "../../storage/database";
import { deletePdf, importPdf } from "../../storage/pdfs";
import { formatBytes } from "../../storage/diagnostics";

export function PdfLibraryPage() {
  const documents = useLiveQuery(() => db.pdfDocuments.orderBy("updatedAt").reverse().toArray(), []) ?? [];
  const characters = useLiveQuery(() => db.characters.orderBy("name").toArray(), []) ?? [];
  const [file, setFile] = useState<File | null>(null);
  const [gameSystem, setGameSystem] = useState("");
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setStatus(`Storing ${file.name} locally...`);
    try {
      const document = await importPdf(file, gameSystem, characterIds);
      setFile(null);
      setGameSystem("");
      setCharacterIds([]);
      setStatus("Stored locally. Ready offline.");
      window.location.hash = `pdf/${document.id}`;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not store this PDF");
    }
  };

  const remove = async (id: string, name: string) => {
    if (window.confirm(`Permanently remove ${name} from this device?`)) await deletePdf(id);
  };

  return (
    <section className="page">
      <PageHeader eyebrow="Offline reference shelf" title="PDF Library" description="Store sourcebooks, adventures, and companion guides entirely on this device." />

      <form className="panel pdf-upload-panel" onSubmit={(event) => void upload(event)}>
        <div><span className="card-label">Add to the vault</span><h2>Upload a PDF</h2><p>Large files are stored as local binary data, subject to your browser's available storage.</p></div>
        <label className="file-drop">
          <span>{file ? file.name : "Choose a PDF file"}</span>
          <small>{file ? formatBytes(file.size) : "PDF files remain on this device"}</small>
          <input accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
        </label>
        <label className="form-field"><span>Game system or collection</span><input maxLength={100} onChange={(event) => setGameSystem(event.target.value)} placeholder="D&D 5e, FFXIV Companion Guide, Homebrew..." value={gameSystem} /></label>
        {characters.length > 0 && <fieldset className="association-picker"><legend>Associate with characters</legend>{characters.map((character) => <label key={character.id}><input checked={characterIds.includes(character.id)} onChange={(event) => setCharacterIds((current) => event.target.checked ? [...current, character.id] : current.filter((id) => id !== character.id))} type="checkbox" />{character.name}</label>)}</fieldset>}
        <button className="primary-button" disabled={!file} type="submit">Store PDF locally</button>
        {status && <p className="inline-message" role="status">{status}</p>}
      </form>

      <div className="section-heading"><div><h2>Local library</h2><p>{documents.length} {documents.length === 1 ? "document" : "documents"} stored on this device</p></div></div>
      {documents.length ? <div className="pdf-grid">{documents.map((document) => {
        const associated = characters.filter((character) => document.characterIds.includes(character.id));
        return <article className="panel pdf-card" key={document.id}>
          <a href={`#pdf/${document.id}`}><span className="pdf-icon">PDF</span><strong>{document.name}</strong><span>{document.gameSystem || "Uncategorized"}</span><small>{formatBytes(document.size)} · Last opened at page {document.lastPage}</small>{associated.length > 0 && <small>{associated.map((character) => character.name).join(", ")}</small>}</a>
          <button className="text-button danger" onClick={() => void remove(document.id, document.name)} type="button">Remove</button>
        </article>;
      })}</div> : <div className="empty-state"><div className="empty-emblem">P</div><h2>Your reference shelf is empty</h2><p>Upload a PDF to keep it available during offline play.</p></div>}
    </section>
  );
}
