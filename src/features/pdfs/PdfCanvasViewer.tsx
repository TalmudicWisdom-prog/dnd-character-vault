import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfCanvasViewerProps = {
  sourceUrl: string;
  pageNumber: number;
  onPageCount: (count: number) => void;
};

export function PdfCanvasViewer({ sourceUrl, pageNumber, onPageCount }: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState("Loading PDF...");

  useEffect(() => {
    if (!sourceUrl) return;
    const loadingTask = getDocument(sourceUrl);
    let active = true;

    void loadingTask.promise.then((document) => {
      if (!active) return;
      setPdf(document);
      onPageCount(document.numPages);
    }).catch(() => {
      if (active) setStatus("This PDF could not be rendered.");
    });

    return () => {
      active = false;
      void loadingTask.destroy();
    };
  }, [onPageCount, sourceUrl]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !containerRef.current) return;
    let renderTask: ReturnType<Awaited<ReturnType<typeof pdf.getPage>>["render"]> | null = null;
    let active = true;

    const render = async () => {
      const page = await pdf.getPage(Math.min(pageNumber, pdf.numPages));
      if (!active || !canvasRef.current || !containerRef.current) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(280, containerRef.current.clientWidth - 32);
      const scale = Math.min(2, availableWidth / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      setStatus("");
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
    };

    void render().catch((error: unknown) => {
      if (active && !(error instanceof Error && error.name === "RenderingCancelledException")) {
        setStatus("This page could not be rendered.");
      }
    });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [pageNumber, pdf]);

  return (
    <div className="pdf-canvas-viewer" ref={containerRef}>
      {status && <div className="pdf-render-status">{status}</div>}
      <canvas aria-label={`PDF page ${pageNumber}`} ref={canvasRef} />
    </div>
  );
}
