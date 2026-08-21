import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ChevronLeft } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TodoDetail } from "@/components/todo/todo-detail";

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

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 md:px-5">
        <Link to="/" className="flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" />
          Home
        </Link>
      </div>
      <div className="flex-1 md:bg-page md:px-6">
        {ref === null || item === null ? (
          <div className="px-5 py-10 text-center text-[13px] text-ink-3">This todo no longer exists.</div>
        ) : item === undefined ? null : (
          <TodoDetail item={item} />
        )}
      </div>
    </div>
  );
}
