import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import { db } from "../../storage/database";
import { addPdfBookmark, deletePdfBookmark, updatePdfDocument } from "../../storage/pdfs";
import { PdfCanvasViewer } from "./PdfCanvasViewer";

export function PdfViewerPage({ documentId }: { documentId: string }) {
  const document = useLiveQuery(() => db.pdfDocuments.get(documentId), [documentId]);
  const file = useLiveQuery(() => db.pdfFiles.get(documentId), [documentId]);
  const bookmarks = useLiveQuery(() => db.pdfBookmarks.where("documentId").equals(documentId).sortBy("page"), [documentId]) ?? [];
  const characters = useLiveQuery(() => db.characters.orderBy("name").toArray(), []) ?? [];
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(() => {
    if (document) setPage(document.lastPage);
  }, [document]);

  useEffect(() => {
    if (!file?.data) return;
    const url = URL.createObjectURL(file.data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const viewerUrl = useMemo(() => objectUrl, [objectUrl]);

  const goToPage = (nextPage: number) => {
    const validPage = Math.min(pageCount, Math.max(1, Math.floor(nextPage || 1)));
    setPage(validPage);
    void updatePdfDocument(documentId, { lastPage: validPage });
  };

  const handlePageCount = useCallback((count: number) => {
    setPageCount(count);
    setPage((current) => {
      if (current <= count) return current;
      void updatePdfDocument(documentId, { lastPage: count });
      return count;
    });
  }, [documentId]);

  const toggleCharacter = (characterId: string, checked: boolean) => {
    if (!document) return;
    const characterIds = checked ? [...document.characterIds, characterId] : document.characterIds.filter((id) => id !== characterId);
    void updatePdfDocument(documentId, { characterIds });
  };

  if (!document || !file) return <section className="page"><div className="loading-state">Opening local PDF...</div></section>;

  return (
    <section className="page pdf-viewer-page">
      <PageHeader eyebrow={document.gameSystem || "Local PDF"} title={document.name} description="Opened from local device storage. No network connection required." actions={<a className="secondary-button button-link" href="#library">Back to library</a>} />

      <div className="pdf-toolbar panel">
        <button className="secondary-button compact" disabled={page <= 1} onClick={() => goToPage(page - 1)} type="button">Previous</button>
        <label className="page-control"><span>Page</span><input max={pageCount} min={1} onChange={(event) => goToPage(Number(event.target.value))} type="number" value={page} /><span>of {pageCount}</span></label>
        <button className="secondary-button compact" disabled={page >= pageCount} onClick={() => goToPage(page + 1)} type="button">Next</button>
        <form className="bookmark-form" onSubmit={(event) => { event.preventDefault(); void addPdfBookmark(documentId, page, bookmarkLabel); setBookmarkLabel(""); }}><input maxLength={150} onChange={(event) => setBookmarkLabel(event.target.value)} placeholder={`Bookmark page ${page}`} value={bookmarkLabel} /><button className="primary-button compact" type="submit">Add bookmark</button></form>
      </div>

      <div className="pdf-viewer-layout">
        <div className="pdf-frame-wrap">{viewerUrl && <PdfCanvasViewer onPageCount={handlePageCount} pageNumber={page} sourceUrl={viewerUrl} />}</div>
        <aside className="pdf-sidebar">
          <article className="panel">
            <span className="card-label">Bookmarks</span>
            <div className="bookmark-list">{bookmarks.length ? bookmarks.map((bookmark) => <div className="bookmark-row" key={bookmark.id}><button onClick={() => goToPage(bookmark.page)} type="button"><strong>{bookmark.label}</strong><small>Page {bookmark.page}</small></button><button aria-label={`Delete ${bookmark.label}`} className="text-button danger" onClick={() => void deletePdfBookmark(bookmark.id)} type="button">×</button></div>) : <p>No bookmarks yet.</p>}</div>
          </article>
          <article className="panel">
            <span className="card-label">Character links</span>
            <div className="association-list">{characters.length ? characters.map((character) => <label key={character.id}><input checked={document.characterIds.includes(character.id)} onChange={(event) => toggleCharacter(character.id, event.target.checked)} type="checkbox" />{character.name}</label>) : <p>Create a character to associate this PDF.</p>}</div>
          </article>
        </aside>
      </div>
    </section>
  );
}
