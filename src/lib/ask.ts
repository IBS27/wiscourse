import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { addDays, dayKeyOf } from "./dates";

export { isRunning as isThreadRunning } from "../../convex/lib/assistant";

export type AskThread = FunctionReturnType<typeof api.assistant.threads>[number];

export interface ThreadGroup {
  id: "today" | "week" | "earlier";
  label: string;
  threads: AskThread[];
}

/** Active chats by recency; archived ones are listed on their own. */
export function groupThreads(threads: AskThread[], todayKey: string): {
  groups: ThreadGroup[];
  archived: AskThread[];
} {
  const weekStart = addDays(todayKey, -6);
  const groups: ThreadGroup[] = [
    { id: "today", label: "Today", threads: [] },
    { id: "week", label: "This week", threads: [] },
    { id: "earlier", label: "Earlier", threads: [] },
  ];
  const archived: AskThread[] = [];
  for (const thread of threads) {
    if (thread.archivedAt !== undefined) {
      archived.push(thread);
      continue;
    }
    const key = dayKeyOf(thread.lastMessageAt);
    groups[key === todayKey ? 0 : key >= weekStart ? 1 : 2].threads.push(thread);
  }
  return { groups: groups.filter((g) => g.threads.length > 0), archived };
}

/** Error text from a failed Convex call, readable as-is. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error && typeof error.data === "string") return error.data;
  return "Something went wrong. Try again.";
}
