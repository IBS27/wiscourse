import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus } from "lucide-react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "../../../convex/_generated/api";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Recently opened documents, so reselecting a file or toggling the expanded
 *  view never downloads or parses it again. Oldest is destroyed first. */
const documents = new Map<string, PDFDocumentLoadingTask>();
const KEEP_DOCUMENTS = 3;

function openDocument(url: string): Promise<PDFDocumentProxy> {
  const cached = documents.get(url);
  if (cached !== undefined) {
    documents.delete(url);
    documents.set(url, cached);
    return cached.promise;
  }
  const task = getDocument({ url });
  documents.set(url, task);
  task.promise.catch(() => {
    if (documents.get(url) === task) documents.delete(url);
  });
  for (const [key, old] of documents) {
    if (documents.size <= KEEP_DOCUMENTS) break;
    documents.delete(key);
    void old.destroy();
  }
  return task.promise;
}

/**
 * The server copies a PDF into Convex storage once per file version; every
 * later view, by anyone in the course, subscribes straight to that URL and
 * pdf.js streams it over HTTP.
 *
 * `deferFetch` holds a cache miss until the parent's metadata request settles:
 * Canvas takes one request per user at a time.
 */
export function PdfPreview({
  fileCanvasId,
  title,
  deferFetch,
}: {
  fileCanvasId: number;
  title: string;
  deferFetch: boolean;
}) {
  const cached = useQuery(api.pdfCache.pdfUrl, { fileCanvasId });
  const prepare = useAction(api.filePreview.pdf);
  const [prepared, setPrepared] = useState<string>();
  const [doc, setDoc] = useState<PDFDocumentProxy>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const url = cached ?? prepared;

  useEffect(() => {
    if (cached !== null || deferFetch || prepared !== undefined) return;
    let cancelled = false;
    prepare({ fileCanvasId }).then(
      (result) => !cancelled && setPrepared(result),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [cached, deferFetch, prepared, prepare, fileCanvasId, attempt]);

  useEffect(() => {
    if (url === undefined) return;
    let cancelled = false;
    openDocument(url).then(
      (result) => !cancelled && setDoc(result),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [url, attempt]);

  if (failed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-xs text-ink-3">
        <p>PDF preview unavailable. You can still download the file.</p>
        <button
          type="button"
          className="underline"
          onClick={() => {
            setFailed(false);
            setDoc(undefined);
            setPrepared(undefined);
            setAttempt((n) => n + 1);
          }}
        >
          Retry preview
        </button>
      </div>
    );
  }
  if (doc === undefined) {
    return (
      <div role="status" className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-ink-3">
        <Loader2 className="size-[14px] animate-spin" aria-hidden />
        Loading PDF…
      </div>
    );
  }
  return <PdfViewer key={url} doc={doc} title={title} />;
}

interface Size {
  width: number;
  height: number;
}

const PAD = 16;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
/** Above this a canvas is blank on some browsers (iOS caps at 16.7M). */
const MAX_PIXELS = 16_000_000;

/**
 * pdf.js' "auto" zoom: a landscape page (a slide) fits whole, a portrait page
 * fits the width up to a comfortable reading size.
 */
function fitWidth(box: Size, page: Size): number {
  const available = box.width - 2 * PAD;
  if (page.width > page.height) {
    return Math.min(available, ((box.height - 2 * PAD) * page.width) / page.height);
  }
  return Math.min(available, page.width * (96 / 72) * 1.25);
}

/** Lags `value` until it stops changing, so a resize re-rasterizes once. */
function useSettled(value: number | undefined, ms: number): number | undefined {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled ?? value;
}

/**
 * Every page in one scroll, each rasterized only while near the viewport and
 * released after, so a 300-page reader costs what two or three pages do.
 */
function PdfViewer({ doc, title }: { doc: PDFDocumentProxy; title: string }) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const pages = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size>();
  const [first, setFirst] = useState<Size>();
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  /** Where the top of the view sits, so resizing or zooming keeps the place. */
  const anchor = useRef({ page: 0, fraction: 0, x: 0.5 });
  const frame = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void doc.getPage(1).then((page) => {
      if (cancelled) return;
      const { width, height } = page.getViewport({ scale: 1 });
      setFirst({ width, height });
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    if (scroller === null) return;
    const observer = new ResizeObserver(([entry]) =>
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller]);

  const width =
    box && first ? Math.max(120, Math.round(fitWidth(box, first) * zoom)) : undefined;
  const renderWidth = useSettled(width, 150);

  const track = () => {
    const element = scroller;
    const list = pages.current;
    if (element === null || list === null) return;
    const top = element.scrollTop;
    const probe = top + element.clientHeight / 3;
    let page = 0;
    let visible = 0;
    for (let i = 0; i < list.children.length; i++) {
      const child = list.children[i] as HTMLElement;
      if (child.offsetTop <= top) page = i;
      if (child.offsetTop <= probe) visible = i;
      else break;
    }
    const at = list.children[page] as HTMLElement | undefined;
    anchor.current = {
      page,
      fraction: at ? (top - at.offsetTop) / at.offsetHeight : 0,
      x: (element.scrollLeft + element.clientWidth / 2) / element.scrollWidth,
    };
    setCurrent(visible + 1);
  };

  // Restore the place after the layout width changes (resize, zoom, expand).
  const laidOut = useRef(false);
  useLayoutEffect(() => {
    if (width === undefined || scroller === null) return;
    if (!laidOut.current) {
      laidOut.current = true;
      return;
    }
    const { page, fraction, x } = anchor.current;
    const at = pages.current?.children[page] as HTMLElement | undefined;
    scroller.scrollTo({
      top: at ? at.offsetTop + fraction * at.offsetHeight : scroller.scrollTop,
      left: x * scroller.scrollWidth - scroller.clientWidth / 2,
    });
  }, [width, scroller]);

  const goTo = (number: number) => {
    const index = Math.min(Math.max(number, 1), doc.numPages) - 1;
    const target = pages.current?.children[index] as HTMLElement | undefined;
    if (target && scroller) scroller.scrollTo({ top: target.offsetTop - PAD });
  };
  const zoomIndex = ZOOMS.indexOf(zoom);
  const aspect = first ? first.height / first.width : 11 / 8.5;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={setScroller}
        tabIndex={0}
        aria-label={`${title}, ${doc.numPages} pages`}
        onScroll={() => {
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(track);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            goTo(current + (event.key === "ArrowRight" ? 1 : -1));
          }
        }}
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
        {width !== undefined && renderWidth !== undefined && scroller !== null && (
          <div
            ref={pages}
            className="relative mx-auto flex w-fit min-w-full flex-col items-center gap-3 p-4 pb-16"
          >
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage
                key={i}
                doc={doc}
                number={i + 1}
                width={width}
                renderWidth={renderWidth}
                estimate={aspect}
                root={scroller}
                title={title}
              />
            ))}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-[2px] rounded-full border border-line bg-surface/90 px-[6px] py-[3px] text-xs text-ink-2 shadow-lg backdrop-blur">
          <ToolButton label="Previous page" disabled={current <= 1} onClick={() => goTo(current - 1)}>
            <ChevronLeft className="size-[14px]" />
          </ToolButton>
          <span className="tabular min-w-[52px] text-center" aria-live="polite">
            {current} / {doc.numPages}
          </span>
          <ToolButton label="Next page" disabled={current >= doc.numPages} onClick={() => goTo(current + 1)}>
            <ChevronRight className="size-[14px]" />
          </ToolButton>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          <ToolButton label="Zoom out" disabled={zoomIndex <= 0} onClick={() => setZoom(ZOOMS[zoomIndex - 1])}>
            <Minus className="size-[14px]" />
          </ToolButton>
          <button
            type="button"
            title="Fit to view"
            onClick={() => setZoom(1)}
            className="tabular min-w-[44px] rounded-full px-1 py-[3px] text-center hover:bg-hover"
          >
            {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
          </button>
          <ToolButton
            label="Zoom in"
            disabled={zoomIndex >= ZOOMS.length - 1}
            onClick={() => setZoom(ZOOMS[zoomIndex + 1])}
          >
            <Plus className="size-[14px]" />
          </ToolButton>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-[26px] place-items-center rounded-full hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * Lays out at `width` immediately (the last raster stretches meanwhile) and
 * re-rasterizes at `renderWidth` into a fresh canvas that replaces the old one
 * only when finished, so pages never flash blank.
 */
function PdfPage({
  doc,
  number,
  width,
  renderWidth,
  estimate,
  root,
  title,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  renderWidth: number;
  /** Height/width of page 1, until this page's own size is known. */
  estimate: number;
  root: HTMLElement;
  title: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [page, setPage] = useState<PDFPageProxy>();

  useEffect(() => {
    const element = frame.current;
    if (element === null) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root,
      rootMargin: "100% 0px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near || page !== undefined) return;
    let cancelled = false;
    void doc.getPage(number).then((result) => {
      if (!cancelled) setPage(result);
    });
    return () => {
      cancelled = true;
    };
  }, [near, page, doc, number]);

  useEffect(() => {
    const element = frame.current;
    if (element === null) return;
    if (!near || page === undefined) {
      element.replaceChildren();
      return;
    }
    const viewport = page.getViewport({ scale: renderWidth / page.getViewport({ scale: 1 }).width });
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.className = "absolute inset-0 size-full";
    const task = page.render({
      canvas,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    let done = false;
    task.promise.then(
      () => {
        done = true;
        element.replaceChildren(canvas);
      },
      () => undefined,
    );
    return () => {
      if (!done) task.cancel();
    };
  }, [near, page, renderWidth]);

  const size = page?.getViewport({ scale: 1 });
  const aspect = size ? size.height / size.width : estimate;
  return (
    <div
      ref={frame}
      role="img"
      aria-label={`${title}, page ${number}`}
      className="relative shrink-0 bg-white shadow-sm"
      style={{ width, height: Math.round(width * aspect) }}
    />
  );
}
