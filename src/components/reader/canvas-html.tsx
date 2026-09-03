import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { canvasUrl, fileHref, rewriteCanvasHref } from "@/lib/course-routes";
import { cn } from "@/lib/utils";

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

const PROSE = [
  "text-[14px] leading-[1.6] text-ink",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:mb-3",
  "[&_h1]:mt-6 [&_h1]:mb-[6px] [&_h1]:text-[17px] [&_h1]:font-semibold [&_h1]:tracking-[-0.02em]",
  "[&_h2]:mt-6 [&_h2]:mb-[6px] [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em]",
  "[&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-[14px] [&_h3]:font-semibold",
  "[&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:text-[13.5px] [&_h4]:font-semibold [&_h4]:text-ink-2",
  "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-[3px] [&_li>ul]:mb-0 [&_li>ol]:mb-0",
  "[&_strong]:font-semibold [&_b]:font-semibold",
  "[&_code]:rounded-[4px] [&_code]:bg-chip [&_code]:px-[5px] [&_code]:py-px [&_code]:font-mono [&_code]:text-[12.5px]",
  "[&_pre]:mb-[14px] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line",
  "[&_pre]:bg-sunken [&_pre]:px-[14px] [&_pre]:py-3 [&_pre]:font-mono [&_pre]:text-[12.5px] [&_pre]:leading-[1.55]",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[12.5px]",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-line-2 [&_blockquote]:pl-3 [&_blockquote]:text-ink-2",
  "[&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md",
  "[&_video]:my-2 [&_video]:h-auto [&_video]:max-w-full [&_video]:rounded-md",
  "[&_[data-table-wrap]]:mb-3 [&_[data-table-wrap]]:overflow-x-auto",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px]",
  "[&_th]:border-b [&_th]:border-line [&_th]:px-2 [&_th]:py-[6px] [&_th]:text-left [&_th]:font-medium [&_th]:text-ink-2",
  "[&_td]:border-b [&_td]:border-line [&_td]:px-2 [&_td]:py-[6px] [&_td]:align-top",
  "[&_hr]:my-5 [&_hr]:border-line",
].join(" ");

// Dotted underline stays inside wiscourse; solid plus a ↗ leaves it.
const LINK = "text-c underline decoration-c/45 underline-offset-[3px] hover:decoration-c";
const INTERNAL_LINK = `${LINK} decoration-dotted`;
const EXTERNAL_LINK = `${LINK} decoration-solid`;
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
