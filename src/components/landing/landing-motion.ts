import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";

/**
 * Motion primitives for the landing page. Everything here is transform and
 * opacity only, driven by CSS (the `lp-*` rules in index.css) or by timers;
 * nothing listens to scroll. Under prefers-reduced-motion every helper
 * resolves straight to its final state.
 */

/** Typed `style` with CSS custom properties. */
export const vars = (v: Record<string, string | number>) => v as CSSProperties;

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

export const prefersReducedMotion = () => reduceMotionQuery()?.matches ?? false;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = reduceMotionQuery();
      query?.addEventListener("change", notify);
      return () => query?.removeEventListener("change", notify);
    },
    prefersReducedMotion,
  );
}

/** True once the element has entered the viewport (or continuously, with `once: false`). */
export function useInView<T extends HTMLElement>(threshold: number, once = true): [RefObject<T | null>, boolean] {
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

/**
 * Staggered entrance for a row inside a preview: spread onto the element as
 * `{...enter(i)}`. It plays whenever the nearest ancestor with `data-on`
 * flips to "true" and rests hidden while that ancestor is "false", so a
 * preview replays its entrance each time it becomes active. Merge your own
 * classes with `cn(enter(i).className, "...")` when the element has some.
 */
export function enter(i: number): { className: string; style: CSSProperties } {
  return { className: "lp-enter", style: vars({ "--i": i }) };
}

/**
 * Steps through a timeline while `active`: returns the index of the last step
 * reached (-1 before the first). `at` holds each step's time in ms from
 * activation. Going inactive rewinds to -1; with `loop` (ms) it replays that
 * long after activation. Reduced motion jumps to the last step.
 */
export function useSequence(active: boolean, at: readonly number[], loop?: number): number {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(-1);
  // The array is usually an inline literal; key the effect on its contents.
  const key = at.join(",");
  useEffect(() => {
    const times = key === "" ? [] : key.split(",").map(Number);
    if (!active) {
      const t = setTimeout(() => setStep(-1), 0);
      return () => clearTimeout(t);
    }
    if (reduce) {
      const t = setTimeout(() => setStep(times.length - 1), 0);
      return () => clearTimeout(t);
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      timers = times.map((ms, i) => setTimeout(() => setStep(i), ms));
      if (loop !== undefined) {
        timers.push(setTimeout(() => { setStep(-1); run(); }, loop));
      }
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [active, reduce, key, loop]);
  return step;
}

/**
 * Types `text` one character at a time while `active`; returns how many
 * characters are showing. Going inactive clears it. Reduced motion shows the
 * whole string at once.
 */
export function useTyped(text: string, active: boolean, { delay = 400, speed = 70 }: { delay?: number; speed?: number } = {}): number {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (!active || reduce) {
      const t = setTimeout(() => setTyped(active ? text.length : 0), 0);
      return () => clearTimeout(t);
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i += 1;
      setTyped(i);
      if (i < text.length) timer = setTimeout(tick, speed * (0.7 + Math.random() * 0.7));
    };
    timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [active, reduce, text, delay, speed]);
  return typed;
}

/**
 * Counts a number from `from` to `to` while `active`, writing straight to the
 * returned ref's text so the tree does not re-render per frame. Render the
 * final value as the element's children; it is what shows without JS motion.
 */
export function useCountUp<T extends HTMLElement>(
  active: boolean,
  { from, to, decimals = 0, duration = 900, delay = 0, suffix = "" }: {
    from: number; to: number; decimals?: number; duration?: number; delay?: number; suffix?: string;
  },
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = (n: number) => { el.textContent = n.toFixed(decimals) + suffix; };
    if (!active) { show(from); return; }
    if (reduce) { show(to); return; }
    show(from);
    let raf = 0;
    const timer = setTimeout(() => {
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        show(from + (to - from) * (1 - (1 - t) ** 3));
        if (t < 1) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [active, reduce, from, to, decimals, duration, delay, suffix]);
  return ref;
}
