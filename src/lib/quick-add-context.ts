import { createContext, useContext } from "react";

export type QuickAddCtx = { open: () => void };
export const QuickAddContext = createContext<QuickAddCtx>({ open: () => {} });

export function useQuickAdd(): QuickAddCtx {
  return useContext(QuickAddContext);
}
