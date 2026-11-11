import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
  type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject,
} from "react";
import { SignInButton } from "@clerk/clerk-react";
import { ArrowRight, CalendarCheck2, Check, Link2, LogIn, Moon, Sun } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { SHOWCASE, type PaneKey } from "./landing-data";
import { prefersReducedMotion, useInView, useReducedMotion, useSequence, vars } from "./landing-motion";
import { FirstSyncCard, HomeWindow, QuickAddDemo, RecentDemo } from "./landing-previews";
import { AskPane } from "./panes/ask";
import { CalendarPane } from "./panes/calendar";
import { CoursesPane } from "./panes/courses";
import { GradesPane } from "./panes/grades";
import { InboxPane } from "./panes/inbox";
import { SearchPane } from "./panes/search";

/**
 * The signed-out landing page. Rendered by the auth provider outside the
 * router, so every "Sign in" opens Clerk's modal and in-page links are plain
 * anchors. The product previews are live miniatures (./landing-previews,
 * ./panes); motion lives in ./landing-motion and the `lp-*` rules in index.css.
 */
export function Landing() {
  return (
    <div className="landing min-h-dvh bg-surface text-ink dark:bg-page">
      <Nav />
      <main>
        <Hero />
        <GettingStarted />
        <Features />
        <Showcase />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

/* ---------- shared bits ---------- */

const WRAP = "mx-auto max-w-[1180px] px-[18px] sm:px-6";
const DISPLAY = "[font-family:var(--lp-display)] font-semibold text-balance";
const H2 = cn(DISPLAY, "text-[30px] leading-[1.08] tracking-[-0.035em] lg:text-[44px]");
const H2_FEATURE = cn(DISPLAY, "text-[26px] leading-[1.1] tracking-[-0.03em] lg:text-[36px]");
const LEAD = "max-w-[50ch] text-[15.5px] leading-[1.55] text-ink-2 lg:text-[16.5px]";
const BTN = cn(
  "group/btn inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-today pr-[14px] pl-4 text-[14px] font-semibold whitespace-nowrap text-today-fg",
  "shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.16)] transition-[translate,scale,box-shadow] duration-200 ease-[var(--lp-ease)]",
  "hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_8px_20px_-6px_color-mix(in_oklab,var(--ink)_45%,transparent)] active:translate-y-0 active:scale-[0.98]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-3",
);

function SignIn({ compact }: { compact?: boolean }) {
  return (
    <SignInButton mode="modal">
      <button type="button" className={cn(BTN, compact && "h-8 px-[13px] text-[13px]")}>
        Sign in
        {!compact && <ArrowRight className="size-[15px] transition-transform duration-200 ease-[var(--lp-ease)] group-hover/btn:translate-x-[3px]" />}
      </button>
    </SignInButton>
  );
}

function scrollToGettingStarted(e: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById("getting-started");
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

/**
 * Fades and lifts its children in the first time they scroll into view.
 * `delay` (ms) staggers siblings that enter together.
 */
function Reveal({
  children, className, delay = 0, as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "h2" | "p" | "li";
}) {
  const [ref, on] = useInView<HTMLElement>(0.2);
  return (
    <Tag
      // The four tags share HTMLElement; the ref only needs to observe it.
      ref={ref as RefObject<never>}
      data-shown={on}
      className={cn("lp-reveal", className)}
      style={delay ? vars({ "--d": `${delay}ms` }) : undefined}
    >
      {children}
    </Tag>
  );
}

/** A sunken panel a preview sits on: a dot field, and a soft light that follows the pointer. */
function Stage({ children, className }: { children: ReactNode; className?: string }) {
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - box.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - box.top}px`);
  };
  return (
    <div onPointerMove={onMove} className={cn("lp-spot relative overflow-hidden rounded-xl border border-line bg-sunken", className)}>
      <div aria-hidden="true" className="lp-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(75%_75%_at_50%_45%,black,transparent)]" />
      <div className="relative px-4 py-9 sm:px-10 sm:py-14">{children}</div>
    </div>
  );
}

/* ---------- nav ---------- */

const isDark = () => document.documentElement.classList.contains("dark");
/** The page theme is the `dark` class on <html>; the app's theme module and the OS can both flip it. */
function subscribeDark(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeDark, isDark);
  // Loaded on demand: the theme module reads matchMedia at import, which test environments lack.
  const flip = () => void import("@/lib/theme").then((m) => m.setTheme(dark ? "light" : "dark"));
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="grid size-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-line-2"
    >
      <Icon key={String(dark)} className="size-[15px] animate-[lp-pop_.4s_var(--lp-ease)_both]" />
    </button>
  );
}

function Nav() {
  return (
    <header className="lp-nav sticky top-0 z-20 h-[60px] before:absolute before:inset-0 before:-z-10 before:border-b before:border-line before:bg-surface/80 before:backdrop-blur-xl dark:before:bg-page/80">
      <div className={cn(WRAP, "flex h-full items-center justify-between")}>
        <a href="/" aria-label="wiscourse"><Logo className="text-[18px]" /></a>
        <nav className="flex items-center gap-[6px] text-[13.5px] font-medium sm:gap-3">
          <a href="#getting-started" onClick={scrollToGettingStarted} className="rounded-lg px-[10px] py-[6px] text-ink-2 transition-colors hover:text-ink">Getting started</a>
          <ThemeToggle />
          <SignIn compact />
        </nav>
      </div>
    </header>
  );
}

/* ---------- hero ---------- */

/** One headline line, rising out of its own clip. The padding keeps descenders inside it. */
function Line({ children, delay, className }: { children: ReactNode; delay: number; className?: string }) {
  return (
    <span className="-mb-[0.14em] block overflow-hidden pb-[0.14em]">
      <span className={cn("block animate-[lp-rise_1s_var(--lp-ease)_both]", className)} style={{ animationDelay: `${delay}ms` }}>
        {children}
      </span>
    </span>
  );
}

function Hero() {
  // The window's story: rows cascade, the sync settles, a task is ticked off, a grade posts.
  const step = useSequence(true, [500, 1800, 3700, 5500]);
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="lp-dots pointer-events-none absolute inset-x-0 top-0 h-[560px] [mask-image:radial-gradient(60%_100%_at_30%_0%,black,transparent)]" />
      <div className={cn(WRAP, "relative pt-12 sm:pt-16 lg:pt-[88px]")}>
        <h1 className={cn(DISPLAY, "text-[38px] leading-[1.02] tracking-[-0.032em] sm:text-[58px] lg:text-[72px]")}>
          <Line delay={60}>Canvas is slow.</Line>
          <Line delay={180} className="text-ink-3">Your week shouldn't be.</Line>
        </h1>
        <p className="mt-5 max-w-[42ch] animate-[lp-fade-up_.9s_var(--lp-ease)_.38s_both] text-[16px] leading-[1.5] text-ink-2 lg:mt-6 lg:text-[18px]">
          Your Canvas courses, assignments and grades, kept in sync and laid out as one agenda.
        </p>
        <div className="mt-7 flex animate-[lp-fade-up_.9s_var(--lp-ease)_.48s_both] items-center gap-6 lg:mt-8">
          <SignIn />
          <a href="#getting-started" onClick={scrollToGettingStarted} className="group inline-flex items-center gap-[6px] text-[14px] font-medium text-ink-2 transition-colors hover:text-ink">
            Getting started
            <ArrowRight className="size-[14px] transition-transform duration-200 ease-[var(--lp-ease)] group-hover:translate-x-[3px]" />
          </a>
        </div>
      </div>

      <div className="relative mx-auto mt-12 max-w-[1280px] px-[18px] sm:px-6 lg:mt-16">
        <div className="lp-tilt">
          <div className="lp-window-in relative">
            {/* The four course colours, as light along the window's top edge. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-[8%] -top-12 h-24 bg-[linear-gradient(90deg,transparent,var(--course-indigo),var(--course-sky),var(--course-teal),var(--course-amber),transparent)] opacity-[0.16] blur-3xl dark:opacity-[0.22]" />
            <HomeWindow step={step} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-[14%] top-0 h-px overflow-hidden opacity-80 [mask-image:linear-gradient(90deg,transparent,black_20%,black_80%,transparent)]">
              <div className="h-full w-[200%] animate-[lp-drift_14s_linear_infinite] bg-[linear-gradient(90deg,var(--course-indigo),var(--course-sky),var(--course-teal),var(--course-amber),var(--course-indigo),var(--course-sky),var(--course-teal),var(--course-amber),var(--course-indigo))]" />
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-b from-transparent to-surface dark:to-page" />
      </div>
    </section>
  );
}

/* ---------- getting started ---------- */

const STEPS = [
  { icon: LogIn, title: "Sign in", body: "Use your email or Google account. wiscourse never asks for your Canvas password.", where: "Takes a minute" },
  { icon: Link2, title: "Connect Canvas in Settings", body: "Link your UW-Madison Canvas account once. Courses, assignments, grades and announcements start syncing right away.", where: "Settings" },
  { icon: CalendarCheck2, title: "Open your agenda", body: "Items land as they arrive. Press N to add your own tasks next to Canvas work, and come back any time.", where: "Home" },
];

function GettingStarted() {
  const [ref, go] = useInView<HTMLDivElement>(0.35);
  return (
    <section id="getting-started" className="scroll-mt-[60px] py-[88px] lg:py-[140px]">
      <div className={WRAP}>
        <Reveal as="h2" className={H2}>Getting started</Reveal>
        <div ref={ref} data-go={go} className="group relative mt-10 grid grid-cols-1 gap-9 lg:mt-16 lg:grid-cols-3 lg:gap-0">
          {/* The path through the three steps draws itself, and each marker lights as it passes. */}
          <div aria-hidden="true" className="absolute top-5 bottom-5 left-5 w-px bg-line lg:right-0 lg:bottom-auto lg:left-0 lg:h-px lg:w-auto">
            <div className="absolute inset-0 origin-top scale-y-0 bg-ink-3 transition-transform duration-[1800ms] ease-[var(--lp-ease)] group-data-[go=true]:scale-y-100 lg:origin-left lg:scale-x-0 lg:scale-y-100 lg:group-data-[go=true]:scale-x-100" />
          </div>
          {STEPS.map(({ icon: Icon, ...s }, i) => (
            <Reveal key={s.title} delay={i * 140} className="relative grid grid-cols-[40px_1fr] gap-x-5 lg:block lg:pr-12">
              <div
                className="relative grid size-10 place-items-center rounded-[10px] border border-line bg-surface text-ink-3 transition-[border-color,color,box-shadow] duration-500 [transition-delay:var(--at)] group-data-[go=true]:border-ink-3 group-data-[go=true]:text-ink group-data-[go=true]:shadow-menu dark:bg-page"
                style={vars({ "--at": `${200 + i * 520}ms` })}
              >
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="pt-2 text-[18px] font-semibold tracking-[-0.02em] lg:mt-6 lg:pt-0">{s.title}</h3>
                <p className="mt-2 max-w-[38ch] text-[14.5px] leading-[1.55] text-ink-2">{s.body}</p>
                <div className="mt-3 text-xs text-ink-3">{s.where}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- features ---------- */

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-[5px] border border-line bg-chip px-[5px] py-px font-mono text-[12.5px] text-ink">{children}</code>
);

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-6 grid gap-[11px] text-[14.5px] text-ink-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-[10px]">
          <Check className="mt-[3px] size-[15px] shrink-0 text-ink-3" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Features() {
  const [quickRef, quickOn] = useInView<HTMLDivElement>(0.45, false);
  const [recentRef, recentOn] = useInView<HTMLDivElement>(0.45, false);
  return (
    <section className="pb-[88px] lg:pb-[140px]">
      <div className={cn(WRAP, "grid gap-[72px] lg:gap-[120px]")}>
        <div className="grid grid-cols-1 items-center gap-9 lg:grid-cols-[5fr_6fr] lg:gap-20">
          <Reveal>
            <h2 className={H2_FEATURE}>Add a task the way you would say it</h2>
            <p className={cn(LEAD, "mt-4")}>Type <Code>read ch 4 fri #cs537</Code> and it goes on Friday, under CS 537.</p>
            <Bullets items={[
              <><Code>#cs537</Code> matches the course, <Code>fri</Code> plans it for Friday</>,
              "Personal tasks sit next to Canvas assignments in the same list",
              <>Press <Code>N</Code> anywhere to open it</>,
            ]} />
          </Reveal>
          <Reveal delay={120}>
            <Stage>
              <div ref={quickRef}><QuickAddDemo active={quickOn} /></div>
            </Stage>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 items-center gap-9 lg:grid-cols-[6fr_5fr] lg:gap-20">
          <Reveal className="lg:order-2">
            <h2 className={H2_FEATURE}>See what changed since you last looked</h2>
            <p className={cn(LEAD, "mt-4")}>Announcements, posted grades and moved due dates, in one feed next to your agenda.</p>
            <Bullets items={[
              "Grades appear only once the instructor posts them",
              "Due-date changes show the old and new time",
              "Older items stay in Inbox",
            ]} />
          </Reveal>
          <Reveal delay={120}>
            <Stage>
              <div ref={recentRef}><RecentDemo active={recentOn} /></div>
            </Stage>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- showcase ---------- */

const PANES: Record<PaneKey, (props: { active: boolean }) => ReactNode> = {
  inbox: InboxPane, courses: CoursesPane, grades: GradesPane, calendar: CalendarPane, search: SearchPane, ask: AskPane,
};
/** How long each pane holds before the next; long enough for the longest pane story. */
const DUR = 7000;

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
  const running = inView && !paused;

  return (
    <section className="pb-[88px] lg:pb-[140px]">
      <div className={WRAP}>
        <Reveal>
          <div
            ref={ref}
            className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-[60px] lg:gap-y-9"
            onMouseEnter={pause}
            onMouseLeave={resume}
            onFocus={pause}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) resume(); }}
          >
            <h2 className={cn(H2, "mb-4 lg:mb-0 lg:pt-2 lg:text-[40px]")}>Everything else Canvas has</h2>
            <div
              role="tablist"
              aria-label="Product areas"
              className="flex gap-[6px] overflow-x-auto pt-[2px] pb-[6px] [scrollbar-width:none] [scroll-snap-type:x_mandatory] lg:flex-col lg:gap-0 lg:overflow-visible lg:p-0 [&::-webkit-scrollbar]:hidden"
            >
              {SHOWCASE.map((s, i) => {
                const on = i === idx;
                return (
                  <button
                    key={s.key}
                    ref={(el) => { buttons.current[i] = el; }}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => select(i)}
                    onKeyDown={(e) => onKey(e, i)}
                    className={cn(
                      "group/tab relative shrink-0 overflow-hidden rounded-lg border border-line px-[13px] py-[7px] text-left transition-colors duration-300 [scroll-snap-align:start] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-line-2",
                      "lg:w-full lg:rounded-none lg:border-0 lg:py-[15px] lg:pr-3 lg:pl-5",
                      on ? "border-line-2 bg-chip text-ink lg:bg-transparent" : "text-ink-3 hover:text-ink-2",
                    )}
                  >
                    {/* The time left on this pane: a bar down the tab's edge (along its bottom on phones). */}
                    <span aria-hidden="true" className="absolute right-0 bottom-0 left-0 h-[2px] lg:top-0 lg:right-auto lg:h-auto lg:w-[2px] lg:bg-line">
                      {on && (
                        <span
                          className={cn(
                            "absolute inset-0 origin-left bg-ink lg:origin-top",
                            !reduce && "animate-[lp-fill-x_linear_both] lg:animate-[lp-fill-y_linear_both]",
                            !running && "[animation-play-state:paused]",
                          )}
                          style={{ animationDuration: `${DUR}ms` }}
                        />
                      )}
                    </span>
                    <h3 className="text-[14px] font-semibold tracking-[-0.01em] lg:text-[15.5px]">{s.title}</h3>
                    <div className={cn("hidden transition-[grid-template-rows,opacity] duration-500 ease-[var(--lp-ease)] lg:grid", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                      <p className="overflow-hidden text-[13.5px] leading-[1.5] text-ink-2"><span className="block pt-[5px]">{s.blurb}</span></p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p key={activeKey} className="animate-[lp-fade_.4s_ease_both] text-[13.5px] leading-[1.5] text-ink-2 lg:hidden">{SHOWCASE[idx].blurb}</p>

            <div className="relative h-[500px] min-w-0 overflow-hidden rounded-xl border border-line bg-surface shadow-float lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[600px]">
              {SHOWCASE.map((s) => {
                const Pane = PANES[s.key];
                const on = s.key === activeKey && inView;
                return (
                  <div
                    key={s.key}
                    data-pane={s.key}
                    data-on={on}
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-0 text-[13px] transition-[opacity,translate,scale] duration-500 ease-[var(--lp-ease)]",
                      s.key === activeKey ? "opacity-100" : "pointer-events-none translate-y-2 scale-[0.99] opacity-0",
                      s.key !== "ask" && "after:pointer-events-none after:absolute after:right-0 after:bottom-0 after:left-0 after:z-[2] after:h-16 after:bg-gradient-to-b after:from-transparent",
                      s.key === "search" ? "after:to-sunken" : "after:to-surface",
                    )}
                  >
                    <Pane active={on} />
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

/** The W of the mark, drawn once as a watermark behind the closing panel. */
function DrawnMark({ go }: { go: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 50.5 32.5"
      fill="none"
      strokeWidth={6.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute top-1/2 left-1/2 w-[128%] -translate-x-1/2 -translate-y-1/2 lg:w-[112%]"
    >
      <path
        d="M3.25 3.25 L14.25 29.25 L25.25 3.25 L36.25 29.25 L47.25 3.25"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1}
        className={cn("stroke-[color-mix(in_oklab,var(--ink)_4%,transparent)] dark:stroke-[color-mix(in_oklab,var(--ink)_5%,transparent)]", go && "animate-[lp-draw_2.2s_var(--lp-ease)_.1s_both]")}
      />
    </svg>
  );
}

function Closing() {
  const [ref, go] = useInView<HTMLDivElement>(0.3);
  return (
    <section className="pb-[72px] lg:pb-[96px]">
      <div className={WRAP}>
        <div ref={ref} className="relative overflow-hidden rounded-xl border border-line bg-sunken px-5 pt-16 pb-12 text-center sm:px-10 lg:pt-24 lg:pb-20">
          <div aria-hidden="true" className="lp-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(70%_70%_at_50%_30%,black,transparent)]" />
          <DrawnMark go={go} />
          <div className="relative">
            <Reveal as="h2" className={cn(DISPLAY, "text-[36px] leading-[1.04] tracking-[-0.04em] lg:text-[60px]")}>Start with this week.</Reveal>
            <Reveal as="p" delay={100} className={cn(LEAD, "mx-auto mt-4 lg:mt-5")}>
              Sign in and connect Canvas in Settings. The first sync starts right away, and you can use the app while it runs.
            </Reveal>
            <Reveal delay={200} className="mt-7"><SignIn /></Reveal>
            <Reveal delay={300} className="mx-auto mt-12 max-w-[440px] lg:mt-14"><FirstSyncCard active={go} /></Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line py-7 text-[12.5px] text-ink-3">
      <div className={cn(WRAP, "flex flex-wrap items-center gap-x-5 gap-y-3")}>
        <Logo className="text-[15px]" />
        <span>Not affiliated with UW-Madison or Instructure.</span>
        <nav className="flex gap-[18px] sm:ml-auto [&_a]:transition-colors [&_a:hover]:text-ink [&_button]:transition-colors [&_button:hover]:text-ink">
          <a href="/privacy.html">Privacy</a>
          <a href="https://github.com/IBS27/wiscourse" target="_blank" rel="noreferrer">GitHub</a>
          <SignInButton mode="modal"><button type="button">Sign in</button></SignInButton>
        </nav>
      </div>
    </footer>
  );
}
