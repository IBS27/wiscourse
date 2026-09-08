import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "../../../convex/_generated/api";
GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfPreview({
  fileCanvasId,
  title,
}: {
  fileCanvasId: number;
  title: string;
}) {
  const load = useAction(api.filePreview.pdf);
  const [doc, setDoc] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(300);
  const [rendering, setRendering] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof getDocument> | undefined;
    void load({ fileCanvasId })
      .then((bytes) => {
        if (cancelled) return;
        task = getDocument({
          data: new Uint8Array(bytes),
        });
        return task.promise;
      })
      .then((pdf) => {
        if (pdf && !cancelled) {
          setDoc(pdf);
          setPage(1);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [fileCanvasId, load, attempt]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(100, entries[0].contentRect.width - 24)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    setRendering(true);
    void doc
      .getPage(page)
      .then((pdfPage) => {
        if (cancelled || !canvas.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: width / base.width });
        const element = canvas.current;
        element.width = Math.ceil(viewport.width * ratio);
        element.height = Math.ceil(viewport.height * ratio);
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        render = pdfPage.render({
          canvas: element,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        return render.promise;
      })
      .then(() => {
        if (!cancelled) setRendering(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [doc, page, width]);
  return (
    <div ref={container} className="flex min-h-0 flex-1 flex-col">
      {doc && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-b border-line py-2 text-xs">
          <button
            aria-label="Previous PDF page"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded p-1 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span>
            Page {page} of {doc.numPages}
          </span>
          <button
            aria-label="Next PDF page"
            disabled={page >= doc.numPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded p-1 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {error ? (
          <div className="p-4 text-center text-xs text-ink-3">
            <p>PDF preview unavailable. You can still download the file.</p>
            <button
              className="mt-3 underline"
              onClick={() => {
                setError(false);
                setDoc(undefined);
                setAttempt((n) => n + 1);
              }}
            >
              Retry preview
            </button>
          </div>
        ) : (
          <>
            {(!doc || rendering) && (
              <p role="status" className="py-3 text-center text-xs text-ink-3">
                Loading PDF…
              </p>
            )}
            <canvas
              ref={canvas}
              role="img"
              aria-label={`${title}, page ${page}`}
              className={doc ? "mx-auto bg-white shadow-sm" : "hidden"}
            />
          </>
        )}
      </div>
    </div>
  );
}
