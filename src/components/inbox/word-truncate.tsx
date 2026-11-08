import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

let canvas: HTMLCanvasElement | undefined;

/** The longest whole-word prefix of `text` that fits `width` with a trailing "…". */
function fitWords(text: string, width: number, font: string): string {
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text;
  ctx.font = font;
  if (ctx.measureText(text).width <= width) return text;
  const words = text.split(/\s+/);
  const clip = (n: number) => `${words.slice(0, n).join(" ").replace(/[\s.,;:!?·–—-]+$/, "")}…`;
  let lo = 1;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(clip(mid)).width <= width) lo = mid;
    else hi = mid - 1;
  }
  return clip(lo);
}

/**
 * One line of text that, when it overflows, ends with "…" after a whole word
 * instead of mid-word. Takes the remaining width of its flex row; CSS
 * truncation stays as a fallback for a single overlong word.
 */
export function WordTruncate({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const s = getComputedStyle(el);
      setShown(fitWords(text, el.clientWidth, `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`));
    };
    fit();
    void document.fonts?.ready.then(fit);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span ref={ref} className={cn("min-w-0 flex-1 truncate", className)} title={shown === text ? undefined : text}>
      {shown}
    </span>
  );
}
