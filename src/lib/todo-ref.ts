import type { TodoItem } from "../../convex/todos";

/** The mutation argument for a list item. */
export function refOf(item: TodoItem) {
  return item.kind === "local"
    ? ({ kind: "local", todoId: item.todoId! } as const)
    : ({ kind: item.kind, canvasId: item.canvasId! } as const);
}
