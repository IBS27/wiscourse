import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ThreadList } from "@/components/ask/thread-list";

export const Route = createFileRoute("/ask")({
  component: AskLayout,
});

function AskLayout() {
  const { threadId } = useParams({ strict: false });
  // The chat column earns its width once there is a chat to list; until then
  // the new-chat screen has the page to itself.
  const threads = useQuery(api.assistant.threads);
  const hasChats = threads !== undefined && threads.length > 0;
  return (
    <div className="flex h-dvh min-h-0 flex-1">
      {hasChats && (
        <aside className="hidden w-[256px] shrink-0 flex-col border-r border-line md:flex">
          <ThreadList activeId={threadId} />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
