import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
  type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject,
} from "react";
import { SignInButton } from "@clerk/clerk-react";
import { ArrowRight, Check } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { QUICK_ADD_TEXT, SHOWCASE, type PaneKey } from "./landing-data";
import {
  AskPane, CalendarPane, CoursesPane, FirstSyncCard, GradesPane, HomePreview, InboxPane,
  NewRail, QuickAddDemo, SearchPane,
} from "./landing-previews";

/**
 * The signed-out landing page. Rendered by the auth provider outside the
 * router, so every "Sign in" opens Clerk's modal and in-page links are plain
 * anchors.
 */
export function Landing() {
  return (
    <div className="landing min-h-dvh bg-surface text-ink dark:bg-page">
      <Nav />
      <Hero />
      <GettingStarted />
      <ProductRows />
      <Showcase />
      <Closing />
      <Footer />
    </div>
  );
}

/* ---------- hooks ---------- */

// Resolved on first use, not at import: test environments (jsdom) have no matchMedia.
let reduceMotion: MediaQueryList | null | undefined;
function reduceMotionQuery(): MediaQueryList | null {
  if (reduceMotion === undefined) {
    reduceMotion = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  }
  return reduceMotion;
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = reduceMotionQuery();
      query?.addEventListener("change", notify);
      return () => query?.removeEventListener("change", notify);
    },
    () => reduceMotionQuery()?.matches ?? false,
  );
}

/** True once the element has entered the viewport (or continuously, with `once: false`). */
function useInView<T extends HTMLElement>(threshold: number, once = true): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No observer (jsdom, very old browsers): treat everything as in view.
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fallback for environments without IntersectionObserver
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            if (once) io.unobserve(e.target);
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);
  return [ref, inView];
}

/** Fades and lifts its children in the first time they scroll into view. */
function Reveal({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "h2" }) {
  const [ref, on] = useInView<HTMLDivElement>(0.2);
  const reduce = useReducedMotion();
  return (
    <Tag
      ref={ref}
      className={cn(
        "transition-[opacity,transform] duration-600 ease-[cubic-bezier(.16,1,.3,1)]",
        on || reduce ? "translate-y-0 opacity-100" : "translate-y-[14px] opacity-0",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/* ---------- shared bits ---------- */

const WRAP = "mx-auto max-w-[1180px] px-[18px] sm:px-6";
const BTN = "inline-flex h-[38px] items-center justify-center gap-2 rounded-lg bg-today px-4 text-[13.5px] font-semibold whitespace-nowrap text-today-fg transition-[opacity,transform] duration-150 hover:opacity-90 active:translate-y-px";

function SignIn({ className }: { className?: string }) {
  return (
    <SignInButton mode="modal">
      <button type="button" className={cn(BTN, className)}>Sign in</button>
    </SignInButton>
  );
}

function scrollToGettingStarted(e: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById("getting-started");
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: reduceMotionQuery()?.matches ? "auto" : "smooth", block: "start" });
}

/* ---------- sections ---------- */

function Nav() {
  return (
    <header className="sticky top-0 z-20 h-[60px] border-b border-line bg-surface/88 backdrop-blur-[10px] dark:bg-page/88">
      <div className={cn(WRAP, "flex h-full items-center justify-between")}>
        <a href="/" aria-label="wiscourse"><Logo className="text-[18px]" /></a>
        <nav className="flex items-center gap-[14px] text-[13.5px] font-medium sm:gap-[22px]">
          <a href="#getting-started" onClick={scrollToGettingStarted} className="text-ink-2 hover:text-ink">Getting started</a>
          <SignIn className="h-8 px-[13px] text-[13px]" />
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setPlaying(true), reduce ? 0 : 200);
    const t2 = setTimeout(() => setSynced(true), reduce ? 0 : 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reduce]);
  return (
    <div className="overflow-hidden pt-11 lg:pt-[72px]">
      <div className={cn(WRAP, "grid grid-cols-1 items-center gap-7 lg:grid-cols-[11fr_13fr] lg:gap-12")}>
        <div className="lg:pb-10">
          <h1 className="mb-5 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[36px] lg:text-[42px] lg:whitespace-nowrap">
            Canvas is slow.
            <span className="block text-ink-3">Your week shouldn't be.</span>
          </h1>
          <p className="mb-7 max-w-[40ch] text-[15px] leading-[1.5] text-ink-2 lg:text-[16.5px]">
            Your Canvas courses, assignments and grades, kept in sync and laid out as one agenda.
          </p>
          <div className="flex items-center gap-[22px]">
            <SignIn />
            <a href="#getting-started" onClick={scrollToGettingStarted} className="group inline-flex items-center gap-[6px] text-[13.5px] font-medium text-ink-2 hover:text-ink">
              Getting started
              <ArrowRight className="size-[14px] transition-transform duration-150 group-hover:translate-x-[2px]" />
            </a>
          </div>
        </div>
        <div className="relative min-w-0">
          <HomePreview playing={playing} synced={synced} />
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-[90px] bg-gradient-to-b from-transparent to-surface lg:-right-40 dark:to-page" />
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { title: "Sign in", body: "Use your email or Google account. wiscourse never asks for your Canvas password.", where: "Takes a minute" },
  { title: "Connect Canvas in Settings", body: "Link your UW-Madison Canvas account once. Courses, assignments, grades and announcements start syncing right away.", where: "Settings" },
  { title: "Open your agenda", body: "Items land as they arrive. Press N to add your own tasks next to Canvas work, and come back any time.", where: "Home" },
];

function GettingStarted() {
  return (
    <section id="getting-started" className="scroll-mt-[60px] border-t border-line py-[72px] lg:py-[120px]">
      <div className={WRAP}>
        <Reveal as="h2" className="mb-3 text-[26px] leading-[1.15] font-semibold tracking-[-0.025em] lg:text-[32px]">Getting started</Reveal>
        <Reveal className="relative mt-9 grid grid-cols-1 gap-9 lg:mt-14 lg:grid-cols-3 lg:gap-0 lg:before:absolute lg:before:top-[7px] lg:before:right-0 lg:before:left-0 lg:before:h-px lg:before:bg-line-2">
          {STEPS.map((s, i) => (
            <div key={s.title} className={cn("relative lg:pr-8", i > 0 && "lg:border-l lg:border-line lg:pl-8")}>
              <div className="relative mb-[26px] size-[15px] rounded-full border-[1.5px] border-ink bg-surface after:absolute after:inset-[3px] after:rounded-full after:bg-ink dark:bg-page" />
              <h3 className="mb-2 text-[17px] font-semibold tracking-[-0.015em]">{s.title}</h3>
              <p className="text-sm leading-[1.55] text-ink-2">{s.body}</p>
              <div className="mt-[10px] text-xs text-ink-3">{s.where}</div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-[4px] border border-line bg-chip px-[5px] py-px font-mono text-[12.5px] text-ink">{children}</code>
);

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-[22px] grid gap-[10px] text-sm text-ink-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-[10px]">
          <Check className="mt-[2px] size-[15px] shrink-0 text-ink-3" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function useTypingDemo(active: boolean, reduce: boolean) {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduce) {
      const t = setTimeout(() => setTyped(QUICK_ADD_TEXT.length), 0);
      return () => clearTimeout(t);
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i += 1;
      setTyped(i);
      if (i < QUICK_ADD_TEXT.length) timer = setTimeout(tick, 60 + Math.random() * 50);
    };
    timer = setTimeout(tick, 500);
    return () => clearTimeout(timer);
  }, [active, reduce]);
  return typed;
}

const H2 = "mb-3 text-[26px] leading-[1.15] font-semibold tracking-[-0.025em] lg:text-[28px]";
const LEAD = "max-w-[54ch] text-[15.5px] leading-[1.55] text-ink-2";

function ProductRows() {
  const reduce = useReducedMotion();
  const [qaRef, qaInView] = useInView<HTMLDivElement>(0.2);
  const typed = useTypingDemo(qaInView, reduce);
  return (
    <section className="py-[72px] lg:py-[120px]">
      <div className={WRAP}>
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-[72px]">
          <Reveal>
            <h2 className={H2}>Add a task the way you would say it</h2>
            <p className={LEAD}>Type <Code>read ch 4 fri #cs537</Code> and it goes on Friday, under CS 537.</p>
            <Bullets items={[
              <><Code>#cs537</Code> matches the course, <Code>fri</Code> plans it for Friday</>,
              "Personal tasks sit next to Canvas assignments in the same list",
              <>Press <Code>N</Code> anywhere to open it</>,
            ]} />
          </Reveal>
          <Reveal>
            <div ref={qaRef}><QuickAddDemo typed={typed} /></div>
          </Reveal>
        </div>

        <div className="mt-[72px] grid grid-cols-1 items-center gap-8 lg:mt-[120px] lg:grid-cols-2 lg:gap-[72px]">
          <Reveal className="lg:order-2">
            <h2 className={H2}>See what changed since you last looked</h2>
            <p className={LEAD}>Announcements, posted grades and moved due dates, in one feed next to your agenda.</p>
            <Bullets items={[
              "Grades appear only once the instructor posts them",
              "Due-date changes show the old and new time",
              "Older items stay in Inbox",
            ]} />
          </Reveal>
          <Reveal><NewRail /></Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- showcase ---------- */

const PANES: Record<PaneKey, () => ReactNode> = {
  inbox: InboxPane, courses: CoursesPane, grades: GradesPane, calendar: CalendarPane, search: SearchPane, ask: AskPane,
};
const DUR = 3500;

function Showcase() {
  const reduce = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.35, false);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(DUR);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const n = SHOWCASE.length;

  // Any selection change starts a fresh interval; the effect below spends it,
  // and on pause keeps whatever is left so hover does not reset the bar.
  useEffect(() => { remaining.current = DUR; }, [idx]);
  useEffect(() => {
    if (reduce || !inView || paused) return;
    const started = Date.now();
    const t = setTimeout(() => setIdx((i) => (i + 1) % n), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(300, remaining.current - (Date.now() - started));
    };
  }, [idx, inView, paused, reduce, n]);

  const select = useCallback((i: number) => setIdx(((i % n) + n) % n), [n]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (((i + d) % n) + n) % n;
    select(next);
    buttons.current[next]?.focus();
  };
  const pause = () => setPaused(true);
  const resume = () => setPaused(false);
  const activeKey = SHOWCASE[idx].key;

  return (
    <section className="border-t border-line py-[72px] lg:py-[120px]">
      <div className={WRAP}>
        <Reveal as="h2" className="mb-3 text-[26px] leading-[1.15] font-semibold tracking-[-0.025em] lg:text-[32px]">Everything else Canvas has</Reveal>
        <Reveal>
          <div
            ref={ref}
            className="mt-7 grid grid-cols-1 gap-5 lg:mt-10 lg:grid-cols-[360px_1fr] lg:gap-14 lg:items-start"
            onMouseEnter={pause}
            onMouseLeave={resume}
            onFocus={pause}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) resume(); }}
          >
            <div
              role="tablist"
              aria-label="Product areas"
              className="flex gap-[6px] overflow-x-auto pt-[2px] pb-[10px] [scrollbar-width:none] [scroll-snap-type:x_mandatory] lg:flex-col lg:gap-0 lg:overflow-visible lg:border-t lg:border-line lg:p-0 [&::-webkit-scrollbar]:hidden"
            >
              {SHOWCASE.map((s, i) => {
                const on = i === idx;
                return (
                  <button
                    key={s.key}
                    ref={(el) => { buttons.current[i] = el; }}
                    type="button"
                    role="tab"
                    aria-pressed={on}
                    aria-selected={on}
                    onClick={() => select(i)}
                    onKeyDown={(e) => onKey(e, i)}
                    className={cn(
                      "relative shrink-0 rounded-md border border-line bg-surface px-3 py-[7px] text-left transition-colors duration-200 [scroll-snap-align:start] focus-visible:outline-2 focus-visible:outline-line-2 focus-visible:-outline-offset-2",
                      "lg:w-full lg:rounded-none lg:border-0 lg:border-b lg:border-line lg:bg-transparent lg:py-[15px] lg:pr-[14px] lg:pl-[18px] lg:hover:bg-hover",
                      on ? "border-line-2 bg-chip text-ink lg:bg-transparent" : "text-ink-3 lg:hover:text-ink-2",
                    )}
                  >
                    <span
                      key={on ? idx : -1}
                      aria-hidden="true"
                      className={cn(
                        "absolute top-0 -bottom-px left-0 hidden w-[2px] origin-top lg:block",
                        on
                          ? cn("bg-ink", reduce ? "scale-y-100" : "animate-[landing-fill_3.5s_linear_forwards]", paused && "[animation-play-state:paused]")
                          : "scale-y-0 bg-line",
                      )}
                    />
                    <h3 className="text-sm font-semibold tracking-[-0.01em]">{s.title}</h3>
                    <p className={cn("mt-[3px] hidden text-[13px] leading-[1.45] lg:line-clamp-2", on && "text-ink-2")}>{s.blurb}</p>
                  </button>
                );
              })}
            </div>

            <div aria-live="polite" className="relative h-[520px] min-w-0 overflow-hidden rounded-lg border border-line bg-surface lg:h-[620px]">
              {SHOWCASE.map((s) => {
                const Pane = PANES[s.key];
                const on = s.key === activeKey;
                return (
                  <div
                    key={s.key}
                    data-pane={s.key}
                    aria-hidden={!on}
                    className={cn(
                      "absolute inset-0 text-[13px]",
                      !reduce && "transition-[opacity,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)]",
                      on ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[6px] opacity-0",
                      s.key !== "ask" && "after:pointer-events-none after:absolute after:right-0 after:bottom-0 after:left-0 after:z-[2] after:h-16 after:bg-gradient-to-b after:from-transparent",
                      s.key === "search" ? "after:to-sunken" : "after:to-surface",
                    )}
                  >
                    <Pane />
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- closing + footer ---------- */

function Closing() {
  const [ref, go] = useInView<HTMLDivElement>(0.4);
  return (
    <section className="border-t border-line py-[72px] lg:py-28">
      <div className={cn(WRAP, "grid grid-cols-1 items-center gap-9 lg:grid-cols-[1fr_440px] lg:gap-[72px]")}>
        <div>
          <Reveal as="h2" className="mb-3 max-w-[16ch] text-[28px] leading-[1.15] font-semibold tracking-[-0.025em] lg:text-[36px]">Start with this week.</Reveal>
          <Reveal className={cn(LEAD, "mb-7")}>Sign in and connect Canvas in Settings. The first sync starts right away, and you can use the app while it runs.</Reveal>
          <Reveal><SignIn /></Reveal>
        </div>
        <Reveal>
          <div ref={ref}><FirstSyncCard go={go} /></div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line py-7 text-[12.5px] text-ink-3">
      <div className={cn(WRAP, "flex flex-wrap items-center gap-5")}>
        <Logo className="text-[15px]" />
        <span>Not affiliated with UW-Madison or Instructure.</span>
        <nav className="flex gap-[18px] sm:ml-auto [&_a:hover]:text-ink [&_button:hover]:text-ink">
          <a href="/privacy.html">Privacy</a>
          <a href="https://github.com/IBS27/wiscourse" target="_blank" rel="noreferrer">GitHub</a>
          <SignInButton mode="modal"><button type="button">Sign in</button></SignInButton>
        </nav>
      </div>
    </footer>
  );
}
