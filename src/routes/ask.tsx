import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { ThreadList } from "@/components/ask/thread-list";

export const Route = createFileRoute("/ask")({
  component: AskLayout,
});

function AskLayout() {
  const { threadId } = useParams({ strict: false });
  return (
    <div className="flex h-dvh min-h-0 flex-1">
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-line md:flex">
        <ThreadList activeId={threadId} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
