import { useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { TodoItem } from "../../../convex/todos";
import type { FileDoc, ModuleItemDoc, StatusContext } from "./module-utils";
import { todoKey } from "@/lib/course-routes";
import { useNow, useToday } from "@/lib/hooks";
import { useSeen } from "@/lib/seen";

/** Everything a row needs that is shared across the whole tab. */
export interface ModuleRowContext {
  courseId: string;
  canvasId: number;
  files: Map<number, FileDoc>;
  status: StatusContext;
  /** Read, or Canvas already counts it complete. */
  isSeen: (item: ModuleItemDoc) => boolean;
  /** Still loading; nothing should claim a progress count yet. */
  seenLoading: boolean;
  open: (item: ModuleItemDoc) => void;
}

// Both queries are ones another surface already subscribes to, so the tab
// costs no extra round trips.
export function useModuleRowContext(courseId: string): ModuleRowContext {
  const canvasId = Number(courseId);
  const tree = useQuery(
    api.files.tree,
    Number.isFinite(canvasId) ? { courseCanvasId: canvasId } : "skip",
  );
  const todos = useQuery(api.todos.list, {});
  const seen = useSeen("moduleItem");
  const todayKey = useToday();
  const now = useNow();

  const files = useMemo(
    () => new Map((tree?.files ?? []).map((file) => [file.canvasId, file])),
    [tree],
  );

  const status = useMemo<StatusContext>(() => {
    const list = (todos ?? []).filter((todo) => todo.courseCanvasId === canvasId);
    // A graded quiz or discussion only reaches the todo list as its
    // assignment; a module row keyed by the quiz id hops through this.
    const assignmentOf = new Map<string, TodoItem>();
    for (const todo of list) {
      if (todo.quizCanvasId !== undefined) {
        assignmentOf.set(todoKey("quiz", todo.quizCanvasId), todo);
      }
      if (todo.discussionCanvasId !== undefined) {
        assignmentOf.set(todoKey("discussion", todo.discussionCanvasId), todo);
      }
    }
    return {
      files,
      todos: new Map(list.map((todo) => [todo.key, todo])),
      assignmentOf,
      todayKey,
      now,
    };
  }, [todos, canvasId, files, todayKey, now]);

  const isSeen = useCallback(
    (item: ModuleItemDoc) =>
      item.completionRequirement?.completed === true || seen.has(item.canvasId),
    [seen],
  );
  const open = useCallback((item: ModuleItemDoc) => seen.mark(item.canvasId), [seen]);

  return { courseId, canvasId, files, status, isSeen, seenLoading: seen.loading, open };
}
