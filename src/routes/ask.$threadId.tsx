import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { optimisticallySendMessage, useUIMessages } from "@convex-dev/agent/react";
import { AlertTriangle, Archive, RotateCw } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Composer } from "@/components/ask/composer";
import { AskMobileNav } from "@/components/ask/mobile-nav";
import { AssistantMessage, UserMessage } from "@/components/ask/message";
import { ThreadMenu } from "@/components/ask/thread-list";
import { Dot } from "@/components/app/bits";
import { errorMessage, isThreadRunning, type AskThread } from "@/lib/ask";
import { courseLabel, courseStyle, useCourses, useNow } from "@/lib/hooks";
import { displayTimeZone } from "@/lib/time-zone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ask/$threadId")({
  component: Conversation,
});

const PAGE = 40;
const STICK_PX = 96;

function Conversation() {
  const { threadId } = Route.useParams();
  const thread = useQuery(api.assistant.thread, { threadId });

  if (thread === null) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="flex h-[54px] items-center gap-1 border-b border-line px-2 md:hidden">
          <AskMobileNav />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-[14px] font-medium">This chat doesn’t exist</p>
          <p className="text-[13px] text-ink-3">It may have been deleted.</p>
          <Link to="/ask" className="mt-2 h-[30px] rounded-lg bg-today px-3 text-[12.5px] leading-[30px] font-medium text-today-fg">
            Start a new chat
          </Link>
        </div>
      </div>
    );
  }
  // Keyed so switching chats resets scroll and local state.
  return <Thread key={threadId} threadId={threadId} thread={thread} />;
}

function Thread({ threadId, thread }: { threadId: string; thread: AskThread | undefined }) {
  const now = useNow(5_000);
  const { results, status, loadMore } = useUIMessages(
    api.assistant.messages,
    { threadId },
    { initialNumItems: PAGE, stream: true },
  );
  const changeList = useQuery(api.assistantChanges.forThread, { threadId });
  const changes = useMemo(() => new Map((changeList ?? []).map((c) => [c._id as string, c])), [changeList]);

  const send = useMutation(api.assistant.send).withOptimisticUpdate((store, args) => {
    if (args.threadId !== undefined) {
      optimisticallySendMessage(api.assistant.messages)(store, { threadId: args.threadId, prompt: args.prompt });
    }
  });
  const stop = useMutation(api.assistant.stop);
  const retry = useMutation(api.assistant.retry);
  const setCourse = useMutation(api.assistant.setCourse);
  const [error, setError] = useState<string | undefined>();

  const running = thread !== undefined && isThreadRunning(thread, now);
  const last = results.at(-1);
  const lastAssistantEmpty = last?.role === "assistant" && last.parts.every((p) => p.type === "step-start" || (p.type === "text" && p.text.trim() === ""));
  const waiting = running && (last === undefined || last.role === "user" || lastAssistantEmpty);
  const stopped = !running && !thread?.error && last?.role === "assistant" && last.status === "failed";

  // Stay pinned to the newest message unless the student scrolled up.
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  // Set when older messages are requested; applied once they have arrived.
  const olderFrom = useRef<{ height: number; top: number; firstKey: string | undefined } | null>(null);
  const firstKey = results[0]?.key;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (olderFrom.current) {
      if (olderFrom.current.firstKey === firstKey) return;
      el.scrollTop = el.scrollHeight - olderFrom.current.height + olderFrom.current.top;
      olderFrom.current = null;
    } else if (pinned.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [results, firstKey, waiting, changeList]);

  const onSend = async (prompt: string) => {
    setError(undefined);
    pinned.current = true;
    try {
      await send({ threadId, prompt, timeZone: displayTimeZone() });
    } catch (caught) {
      setError(errorMessage(caught));
      throw caught;
    }
  };

  const onRetry = async () => {
    setError(undefined);
    try {
      await retry({ threadId, timeZone: displayTimeZone() });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ThreadHeader thread={thread} />
      <div
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-[700px] flex-col gap-[18px] px-4 pt-6 pb-4 md:px-6">
          {status === "CanLoadMore" && (
            <button
              type="button"
              onClick={() => {
                const el = scroller.current;
                if (el) olderFrom.current = { height: el.scrollHeight, top: el.scrollTop, firstKey };
                loadMore(PAGE);
              }}
              className="mx-auto h-7 rounded-md px-3 text-[12px] text-ink-3 hover:bg-hover hover:text-ink"
            >
              Load earlier messages
            </button>
          )}
          {status === "LoadingFirstPage" ? (
            <div className="flex flex-col gap-3" aria-hidden>
              <div className="ml-auto h-9 w-2/5 animate-pulse rounded-xl bg-sunken" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-sunken" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-sunken" />
            </div>
          ) : (
            results.map((message) =>
              message.role === "user" ? (
                <UserMessage key={message.key} message={message} />
              ) : message.role === "assistant" ? (
                <AssistantMessage key={message.key} message={message} changes={changeList === undefined ? undefined : changes} />
              ) : null,
            )
          )}
          {waiting && (
            <div className="flex items-center gap-[7px] text-[12px] text-ink-3" role="status">
              <span className="size-3 animate-spin rounded-full border-[1.5px] border-line-2 border-t-ink-2 motion-reduce:animate-none" />
              Thinking
            </div>
          )}
          {stopped && (
            <button
              type="button"
              onClick={() => void onRetry()}
              className="-mt-2 inline-flex h-[26px] w-fit items-center gap-[6px] rounded-lg px-[6px] text-[12px] text-ink-3 hover:bg-hover hover:text-ink"
            >
              <RotateCw className="size-3" />
              Retry
            </button>
          )}
          {!running && thread?.error && (
            <div className="flex items-start gap-[9px] rounded-[10px] border border-line px-3 py-[10px] text-[13px]" role="alert">
              <AlertTriangle className="mt-[2px] size-[14px] shrink-0 text-red" />
              <div className="flex-1">
                {thread.error}
                <div className="mt-px text-[12px] text-ink-3">Your message is saved. Try again, or come back in a minute.</div>
              </div>
              <button
                type="button"
                onClick={() => void onRetry()}
                className="inline-flex h-[26px] shrink-0 items-center gap-[6px] rounded-lg border border-line-2 bg-surface px-[9px] text-[12px] font-medium"
              >
                <RotateCw className="size-3" />
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[700px] shrink-0 px-3 pb-[max(10px,env(safe-area-inset-bottom))] md:px-6">
        {thread?.archivedAt !== undefined && <ArchivedNote threadId={threadId} />}
        <Composer
          onSend={onSend}
          onStop={() => void stop({ threadId })}
          running={running}
          courseCanvasId={thread?.courseCanvasId}
          onCourseChange={(courseCanvasId) => void setCourse({ threadId, courseCanvasId: courseCanvasId ?? null })}
          placeholder="Reply, or ask something new"
          autoFocus
        />
        <p className={cn("pt-2 text-center text-[11px]", error ? "text-red" : "text-ink-3")} role="status">
          {error ?? "Reads your Canvas courses. Changes only your wiscourse tasks, plans and calendar."}
        </p>
      </div>
    </div>
  );
}

function ArchivedNote({ threadId }: { threadId: string }) {
  const setArchived = useMutation(api.assistant.setArchived);
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-[12.5px] text-ink-2">
      <Archive className="size-[13px] text-ink-3" />
      <span className="flex-1">This chat is archived. Sending a message brings it back.</span>
      <button type="button" onClick={() => void setArchived({ threadId, archived: false })} className="font-medium text-ink hover:underline">
        Unarchive
      </button>
    </div>
  );
}

function ThreadHeader({ thread }: { thread: AskThread | undefined }) {
  const { byId, color } = useCourses();
  const rename = useMutation(api.assistant.rename);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const course = thread?.courseCanvasId === undefined ? undefined : byId.get(thread.courseCanvasId);

  const save = () => {
    const title = draft.trim();
    if (thread && title !== "" && title !== thread.title) void rename({ threadId: thread.threadId, title });
    setEditing(false);
  };

  return (
    <header className="flex h-[54px] shrink-0 items-center gap-[10px] border-b border-line px-2 md:pr-[14px] md:pl-6">
      <AskMobileNav activeId={thread?.threadId} />
      <div className="flex min-w-0 flex-1 items-center gap-[10px]">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") setEditing(false);
            }}
            maxLength={80}
            aria-label="Chat name"
            className="h-8 min-w-0 flex-1 rounded-md border border-line-2 bg-surface px-2 text-[15px] font-semibold tracking-[-0.015em] outline-none"
          />
        ) : (
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.015em]">{thread?.title ?? ""}</h1>
        )}
        {course && !editing && (
          <span
            className="hidden h-[21px] shrink-0 items-center gap-[5px] rounded-md bg-chip px-2 text-[11.5px] font-medium text-ink-2 sm:inline-flex"
            style={courseStyle(color(course.canvasId))}
          >
            <Dot />
            {courseLabel(course)}
          </span>
        )}
      </div>
      {thread && (
        <ThreadMenu
          thread={thread}
          trigger="header"
          onRename={() => {
            setDraft(thread.title);
            setEditing(true);
          }}
        />
      )}
    </header>
  );
}
