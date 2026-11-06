import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ChevronLeft, SearchX } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TodoDetail } from "@/components/todo/todo-detail";
import { announcementsHref } from "@/lib/course-routes";

export const Route = createFileRoute("/todo/$key")({
  component: TodoPage,
});

function parseKey(key: string) {
  const i = key.indexOf(":");
  const kind = key.slice(0, i);
  const rest = key.slice(i + 1);
  if (kind === "local") return { kind: "local", todoId: rest as Id<"todos"> } as const;
  if (kind === "assignment" || kind === "quiz" || kind === "discussion") {
    return { kind, canvasId: Number(rest) } as const;
  }
  return null;
}

function TodoPage() {
  const { key } = Route.useParams();
  const ref = parseKey(key);
  const item = useQuery(api.todos.get, ref ? { ref } : "skip");

  // Canvas writes announcements as `discussion_topics/:id`, so a rewritten
  // link can land here for something that was never a todo.
  const orphan = ref?.kind === "discussion" && item === null;
  const discussion = useQuery(
    api.discussions.get,
    orphan ? { canvasId: ref.canvasId } : "skip",
  );

  if (discussion !== undefined && discussion !== null && discussion.isAnnouncement) {
    return (
      <Navigate
        to={announcementsHref(discussion.courseCanvasId, discussion.canvasId)}
        replace
      />
    );
  }

  const looking = orphan && discussion === undefined;
  const missing = (ref === null || item === null) && !looking;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex min-h-[56px] items-center gap-2 border-b border-line px-4 md:min-h-[64px] md:px-6">
        <Link
          to="/"
          className="-ml-2 flex h-8 shrink-0 items-center gap-1 rounded-md pr-[10px] pl-[6px] text-[13px] font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" />
          Home
        </Link>
        {item && (
          <>
            <span className="text-line-2 max-md:hidden" aria-hidden>/</span>
            <span className="truncate text-[13px] text-ink-2 max-md:hidden">{item.title}</span>
          </>
        )}
      </div>
      <div className="flex-1 md:bg-page md:px-6">
        {missing ? (
          <div className="flex flex-col items-center gap-2 px-5 py-16 text-center">
            <SearchX className="size-5 text-ink-3" />
            <div className="text-[14px] font-medium text-ink-2">Todo not found</div>
            <div className="text-[12.5px] text-ink-3">It may have been deleted, or Canvas removed it.</div>
          </div>
        ) : item === undefined || item === null ? null : (
          <TodoDetail item={item} />
        )}
      </div>
    </div>
  );
}
