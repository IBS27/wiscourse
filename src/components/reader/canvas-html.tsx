import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { canvasUrl, fileHref, rewriteCanvasHref } from "@/lib/course-routes";
import { cn } from "@/lib/utils";
import { EXTERNAL_LINK, INTERNAL_LINK, PROSE } from "@/lib/prose";

export interface Heading {
  id: string;
  level: 2 | 3;
  text: string;
}

export function CanvasHtml({
  html,
  courseId,
  onOutline,
  className,
}: {
  html: string | undefined;
  /** The course the HTML belongs to; resolves course-less Canvas links. */
  courseId: number;
  /** h2/h3 outline, in document order. Fires whenever the body changes. */
  onOutline?: (headings: Heading[]) => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const { markup, headings } = useMemo(() => transform(html ?? "", courseId), [html, courseId]);

  useEffect(() => onOutline?.(headings), [headings, onOutline]);

  // One delegated handler instead of hydrating every anchor into a <Link>.
  const onClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[data-to]");
      const to = anchor?.getAttribute("data-to");
      if (!to) return;
      event.preventDefault();
      void navigate({ to });
    },
    [navigate],
  );

  if (markup === "") return null;
  return (
    <div
      className={cn(PROSE, className)}
      onClick={onClick}
      // Sanitised above; `transform` only ever adds attributes of our own.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

// ── typography ──────────────────────────────────────────────────────────────

/** Files are objects, not prose — they get a chip. */
const FILE_CHIP =
  "inline-flex h-[26px] max-w-full items-center gap-[6px] rounded-md border border-line bg-surface px-[9px] align-[-7px] text-[12.5px] text-ink no-underline hover:bg-hover";
const EMBED_MARKER = "wiscourse-embed";
const EMBED_CARD =
  "my-3 inline-flex items-center gap-[7px] rounded-lg border border-line bg-sunken px-3 py-2 text-[12.5px] text-ink-2 no-underline hover:bg-hover";

const ICON = 'width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ARROW_SVG = `<svg ${ICON} class="ml-[3px] inline-block size-[11px] align-[-1px]" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>`;
const FILE_SVG = `<svg ${ICON} class="size-[13px] shrink-0 text-ink-3" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/></svg>`;

// ── sanitise + rewrite ──────────────────────────────────────────────────────

// Only what DOMPurify's default allow-list would otherwise let through:
// Canvas inline styles fight our tokens and its classes mean nothing here.
const SANITIZE = {
  FORBID_TAGS: ["style", "form", "input", "button"],
  FORBID_ATTR: ["style", "class", "srcset", "width", "height", "align", "bgcolor"],
  ALLOW_DATA_ATTR: false,
};

function transform(html: string, courseId: number): { markup: string; headings: Heading[] } {
  const headings: Heading[] = [];
  if (html.trim() === "") return { markup: "", headings };

  // Parsed into an inert document first so an embed's `src` survives long
  // enough to become a link; `DOMParser` never runs scripts or loads it.
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const frame of Array.from(parsed.querySelectorAll("iframe"))) {
    frame.replaceWith(embedLink(parsed, frame));
  }

  const fragment = DOMPurify.sanitize(parsed.body.innerHTML, {
    ...SANITIZE,
    RETURN_DOM_FRAGMENT: true,
  });
  const root = document.createElement("div");
  root.appendChild(fragment);

  for (const anchor of Array.from(root.querySelectorAll("a"))) rewriteAnchor(anchor, courseId);

  const used = new Set<string>();
  for (const node of Array.from(root.querySelectorAll("h2, h3"))) {
    const level = node.tagName === "H2" ? 2 : 3;
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text === "") continue;
    const id = uniqueId(node.getAttribute("id") ?? slug(text), used);
    node.setAttribute("id", id);
    headings.push({ id, level, text });
  }

  // Wide tables scroll on their own rather than stretching the column.
  for (const table of Array.from(root.querySelectorAll("table"))) {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-table-wrap", "");
    table.replaceWith(wrap);
    wrap.appendChild(table);
  }

  return { markup: root.innerHTML, headings };
}

/** Canvas embeds (Kaltura, Google Docs, YouTube) become a link, not a frame. */
function embedLink(doc: Document, frame: Element): Element {
  const src = frame.getAttribute("src") ?? "";
  const title = (frame.getAttribute("title") ?? "").trim();
  const anchor = doc.createElement("a");
  let href: string;
  try {
    href = new URL(src, canvasUrl("/")).href;
  } catch {
    href = canvasUrl("/");
  }
  anchor.setAttribute("href", href);
  // `rel` survives sanitisation, so it — not a data attribute — is what
  // tells the anchor pass that this used to be an embed.
  anchor.setAttribute("rel", EMBED_MARKER);
  anchor.textContent = title === "" ? "Open in Canvas" : `${title} — open in Canvas`;
  return anchor;
}

function rewriteAnchor(anchor: HTMLAnchorElement, courseId: number): void {
  const href = anchor.getAttribute("href") ?? "";

  if (anchor.getAttribute("rel") === EMBED_MARKER) {
    anchor.className = EMBED_CARD;
    openInNewTab(anchor);
    anchor.insertAdjacentHTML("beforeend", ARROW_SVG);
    return;
  }
  // In-page anchors (Canvas syllabi love them) stay in the page.
  if (href === "" || href.startsWith("#")) {
    anchor.className = INTERNAL_LINK;
    return;
  }

  const target = rewriteCanvasHref(href, courseId);
  if (target.kind === "internal") {
    anchor.setAttribute("href", target.to);
    anchor.setAttribute("data-to", target.to);
    anchor.className = INTERNAL_LINK;
    return;
  }
  if (target.kind === "file") {
    const to = fileHref(target.courseId, target.fileId);
    anchor.setAttribute("href", to);
    anchor.setAttribute("data-to", to);
    anchor.className = FILE_CHIP;
    const name = (anchor.textContent ?? "").trim();
    anchor.textContent = name === "" ? "File" : name;
    anchor.insertAdjacentHTML("afterbegin", FILE_SVG);
    return;
  }
  anchor.setAttribute("href", target.href);
  anchor.className = EXTERNAL_LINK;
  openInNewTab(anchor);
  anchor.insertAdjacentHTML("beforeend", ARROW_SVG);
}

function openInNewTab(anchor: HTMLAnchorElement): void {
  anchor.setAttribute("target", "_blank");
  anchor.setAttribute("rel", "noreferrer noopener");
}

function slug(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return base === "" ? "section" : base;
}

function uniqueId(candidate: string, used: Set<string>): string {
  let id = candidate;
  for (let n = 2; used.has(id); n += 1) id = `${candidate}-${n}`;
  used.add(id);
  return id;
}
