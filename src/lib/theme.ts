import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "wiscourse.theme";
const listeners = new Set<() => void>();
const media = window.matchMedia("(prefers-color-scheme: dark)");

function read(): Theme {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function apply() {
  const t = read();
  const dark = t === "dark" || (t === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
  for (const l of listeners) l();
}

media.addEventListener("change", apply);

export function setTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, theme);
  apply();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
}
