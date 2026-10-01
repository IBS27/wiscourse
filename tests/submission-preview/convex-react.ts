// Stands in for `convex/react` in the preview: queries poll the mock backend,
// mutations post to it. Same hook signatures the rendered components use.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";

type Reply = { value?: unknown; error?: { message: string; data?: unknown } };

async function call(type: "query" | "mutation" | "action", name: string, args: unknown): Promise<unknown> {
  const response = await fetch("/__mock/call", { method: "POST", body: JSON.stringify({ type, name, args }) });
  const reply = (await response.json()) as Reply;
  if (reply.error) throw reply.error.data !== undefined ? new ConvexError(reply.error.data as string) : new Error(reply.error.message);
  return reply.value ?? undefined;
}

const subscriptions = new Map<string, { name: string; args: unknown; count: number }>();
const cache = new Map<string, { json: string; value: unknown }>();
const listeners = new Set<() => void>();
let refreshing = false;

export async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    let changed = false;
    for (const [key, sub] of [...subscriptions]) {
      const value = await call("query", sub.name, sub.args).catch(() => undefined);
      const json = JSON.stringify(value);
      if (cache.get(key)?.json !== json) {
        cache.set(key, { json, value });
        changed = true;
      }
    }
    if (changed) for (const notify of listeners) notify();
  } finally {
    refreshing = false;
  }
}
setInterval(() => void refresh(), 400);

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => void listeners.delete(notify);
}

export function useQuery<Query extends FunctionReference<"query">>(query: Query, ...rest: [Query["_args"] | "skip"] | []): Query["_returnType"] | undefined {
  const args = rest[0] ?? {};
  const key = args === "skip" ? null : JSON.stringify([getFunctionName(query), args]);
  useEffect(() => {
    if (key === null) return;
    const [name, parsed] = JSON.parse(key) as [string, unknown];
    const sub = subscriptions.get(key) ?? { name, args: parsed, count: 0 };
    sub.count += 1;
    subscriptions.set(key, sub);
    void refresh();
    return () => {
      sub.count -= 1;
      if (sub.count === 0) subscriptions.delete(key);
    };
  }, [key]);
  return useSyncExternalStore(subscribe, () => (key === null ? undefined : cache.get(key)?.value)) as Query["_returnType"] | undefined;
}

function useCall<Fn extends FunctionReference<"mutation" | "action">>(type: "mutation" | "action", fn: Fn) {
  const name = getFunctionName(fn);
  return useCallback(async (...args: [Fn["_args"]?]) => {
    try {
      return (await call(type, name, args[0] ?? {})) as Fn["_returnType"];
    } finally {
      void refresh();
    }
  }, [type, name]);
}

export function useMutation<Mutation extends FunctionReference<"mutation">>(mutation: Mutation) {
  return useCall("mutation", mutation);
}

export function useAction<Action extends FunctionReference<"action">>(action: Action) {
  return useCall("action", action);
}
