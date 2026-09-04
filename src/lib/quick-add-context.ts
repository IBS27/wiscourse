import { createContext, useContext } from "react";

export type QuickAddCtx = {
  /** `prefill` seeds the input — ⌘K passes the query you had typed. */
  open: (prefill?: unknown) => void;
};
export const QuickAddContext = createContext<QuickAddCtx>({ open: () => {} });

export function useQuickAdd(): QuickAddCtx {
  return useContext(QuickAddContext);
}
