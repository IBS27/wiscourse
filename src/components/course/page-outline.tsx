import { useEffect, useState } from "react";
import type { Heading } from "@/components/reader/canvas-html";
import { cn } from "@/lib/utils";

/** Fewer than this and the outline is noise, not navigation. */
const MIN_HEADINGS = 3;
const NONE: Heading[] = [];

/** "On this page" — the reading column's right rail. */
export function PageOutline({ headings }: { headings: Heading[] }) {
  const enough = headings.length >= MIN_HEADINGS;
  const active = useScrollSpy(enough ? headings : NONE);
  if (!enough) return null;

  return (
    <nav
      aria-label="On this page"
      className="sticky top-0 hidden w-[220px] shrink-0 self-start py-7 pr-5 text-[12.5px] lg:block"
    >
      <div className="eyebrow mb-2">On this page</div>
      {headings.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          onClick={(event) => {
            event.preventDefault();
            document.getElementById(heading.id)?.scrollIntoView({ block: "start" });
          }}
          className={cn(
            "block border-l border-line py-1 pl-[10px] text-ink-3 hover:text-ink-2",
            heading.level === 3 && "pl-5",
            heading.id === active && "border-ink text-ink",
          )}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  );
}

function useScrollSpy(headings: Heading[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (headings.length === 0) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current: string | undefined = headings[0].id;
      for (const heading of headings) {
        const top = document.getElementById(heading.id)?.getBoundingClientRect().top;
        if (top === undefined || top > 120) break;
        current = heading.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    // Captured at the window: the app scrolls `<main>`, and scroll does not bubble.
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, [headings]);

  return active;
}
