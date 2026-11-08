import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Archive, ArchiveRestore, ChevronRight, MessagesSquare, MoreHorizontal, Pencil, SquarePen, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Dot, Kbd } from "@/components/app/bits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { groupThreads, isThreadRunning, errorMessage, type AskThread } from "@/lib/ask";
import { dayKeyOf, formatMonthDay, formatTime, formatWeekday } from "@/lib/dates";
import { courseStyle, useCourses, useNow, useToday } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function when(ms: number, todayKey: string, now: number): string {
  const key = dayKeyOf(ms);
  if (key === todayKey) return formatTime(ms).replace(/\s?[AP]M$/, "");
  if (now - ms < 6 * 24 * 60 * 60 * 1000) return formatWeekday(key);
  return formatMonthDay(ms);
}

export function ThreadList({ activeId, onNavigate }: { activeId?: string; onNavigate?: () => void }) {
  const threads = useQuery(api.assistant.threads);
  const todayKey = useToday();
  const now = useNow();
  const [showArchived, setShowArchived] = useState(false);
  const { groups, archived } = groupThreads(threads ?? [], todayKey);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center px-4 md:h-16">
        <span className="page-title">Chats</span>
      </div>
      <div className="shrink-0 px-[10px] pb-1">
        <Link
          to="/ask"
          onClick={onNavigate}
          aria-label="New chat"
          className="flex h-8 items-center gap-[9px] rounded-lg px-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none"
        >
          <SquarePen className="size-[15px] text-ink-3" />
          <span className="flex-1">New chat</span>
          <Kbd className="hidden md:inline">⌘J</Kbd>
        </Link>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-[10px] pb-3" aria-label="Chats">
        {threads === undefined ? null : threads.length === 0 ? (
          <div className="mx-2 mt-4 flex flex-col items-start gap-1 border-t border-line pt-5">
            <MessagesSquare className="mb-1 size-[16px] text-ink-3" />
            <p className="text-[13px] font-medium text-ink-2">No chats yet</p>
            <p className="text-[12.5px] leading-[1.5] text-ink-3">
              Your conversations with Ask are saved here.
            </p>
          </div>
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.id}>
                <div className="px-2 pt-4 pb-1 text-[12px] font-medium text-ink-3">{group.label}</div>
                {group.threads.map((t) => (
                  <ThreadRow key={t.threadId} thread={t} active={t.threadId === activeId} label={when(t.lastMessageAt, todayKey, now)} running={isThreadRunning(t, now)} onNavigate={onNavigate} />
                ))}
              </section>
            ))}
            {archived.length > 0 && (
              <section className="mt-3 border-t border-line pt-2">
                <button
                  type="button"
                  onClick={() => setShowArchived(!showArchived)}
                  aria-expanded={showArchived}
                  className="flex w-full items-center gap-[6px] rounded-md px-2 py-[6px] text-[12.5px] text-ink-3 hover:text-ink-2"
                >
                  <ChevronRight className={cn("size-[13px] transition-transform motion-reduce:transition-none", showArchived && "rotate-90")} />
                  Archived
                  <span className="ml-auto text-[11px] font-semibold">{archived.length}</span>
                </button>
                {showArchived &&
                  archived.map((t) => (
                    <ThreadRow key={t.threadId} thread={t} active={t.threadId === activeId} label={when(t.lastMessageAt, todayKey, now)} running={isThreadRunning(t, now)} onNavigate={onNavigate} />
                  ))}
              </section>
            )}
          </>
        )}
      </nav>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  label,
  running,
  onNavigate,
}: {
  thread: AskThread;
  active: boolean;
  label: string;
  running: boolean;
  onNavigate?: () => void;
}) {
  const { color } = useCourses();
  const [renaming, setRenaming] = useState(false);

  return (
    <div
      className={cn(
        "group relative flex items-center rounded-lg text-[13px] text-ink-2 transition-colors hover:bg-hover",
        active && "bg-hover font-medium text-ink",
      )}
      style={courseStyle(color(thread.courseCanvasId))}
    >
      {renaming ? (
        <RenameField thread={thread} onDone={() => setRenaming(false)} />
      ) : (
        <Link
          to="/ask/$threadId"
          params={{ threadId: thread.threadId }}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-[9px] rounded-lg py-[7px] pr-8 pl-2 outline-none focus-visible:ring-2 focus-visible:ring-line-2"
        >
          <Dot className={cn(thread.archivedAt !== undefined && "opacity-50")} />
          <span className={cn("min-w-0 flex-1 truncate", thread.archivedAt !== undefined && "text-ink-3")}>{thread.title}</span>
          {running ? (
            <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-line-2 border-t-ink-2 motion-reduce:animate-none" aria-label="Replying" />
          ) : (
            <span className="shrink-0 text-[11px] font-normal tabular text-ink-3 group-hover:invisible group-has-[[data-state=open]]:invisible">{label}</span>
          )}
        </Link>
      )}
      {!renaming && <ThreadMenu thread={thread} onRename={() => setRenaming(true)} className="absolute right-1" />}
    </div>
  );
}

function RenameField({ thread, onDone }: { thread: AskThread; onDone: () => void }) {
  const rename = useMutation(api.assistant.rename);
  const [value, setValue] = useState(thread.title);
  const save = () => {
    const title = value.trim();
    if (title !== "" && title !== thread.title) void rename({ threadId: thread.threadId, title });
    onDone();
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") save();
        if (event.key === "Escape") onDone();
      }}
      aria-label="Chat name"
      maxLength={80}
      className="m-[2px] h-[30px] min-w-0 flex-1 rounded-md border border-line-2 bg-surface px-[7px] text-[13px] text-ink outline-none"
    />
  );
}

/** Rename, archive and delete; shared by the list and the chat header. */
export function ThreadMenu({
  thread,
  onRename,
  className,
  trigger = "row",
}: {
  thread: AskThread;
  onRename: () => void;
  className?: string;
  trigger?: "row" | "header";
}) {
  const setArchived = useMutation(api.assistant.setArchived);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = thread.archivedAt !== undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Chat options"
            className={cn(
              "grid place-items-center rounded-md text-ink-3 outline-none hover:bg-surface hover:text-ink data-[state=open]:text-ink",
              trigger === "row"
                ? "size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                : "size-7 hover:bg-hover",
              className,
            )}
          >
            <MoreHorizontal className="size-[15px]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void setArchived({ threadId: thread.threadId, archived: !archived })}>
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-red [&_svg]:text-red">
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDialog thread={thread} open={confirmDelete} onOpenChange={setConfirmDelete} />
    </>
  );
}

function DeleteDialog({
  thread,
  open,
  onOpenChange,
}: {
  thread: AskThread;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useMutation(api.assistant.remove);
  const navigate = useNavigate();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await remove({ threadId: thread.threadId });
      onOpenChange(false);
      if (window.location.pathname === `/ask/${thread.threadId}`) void navigate({ to: "/ask" });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] p-5">
        <DialogTitle className="text-[15px] font-semibold tracking-[-0.015em]">Delete this chat?</DialogTitle>
        <DialogDescription className="mt-[6px] text-[13px] leading-[1.5] text-ink-2">
          “{thread.title}” and its messages are removed. Tasks and events Ask already changed stay as they are.
        </DialogDescription>
        {error && <p className="mt-3 text-[12.5px] text-red">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-[30px] rounded-lg border border-line-2 bg-surface px-3 text-[12.5px] font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDelete()}
            className="h-[30px] rounded-lg bg-red px-3 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            Delete chat
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
