import { useInboxFeed, useTodoList } from "@/lib/list-queries";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCheck, Inbox } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { CourseSelect, InboxFilters, UnreadToggle, type TypeCounts } from "@/components/inbox/filters";
import { InboxRow } from "@/components/inbox/row";
import { DetailEmpty, DetailLoading, InboxDetail } from "@/components/inbox/detail";
import { parseInboxSearch, type InboxSearch } from "@/components/inbox/search";
import { feedSeenKind, groupFeed } from "@/lib/feed";
import { formatSince } from "@/lib/dates";
import { useNow, useToday } from "@/lib/hooks";
import { useSyncInfo } from "@/lib/sync-info";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inbox")({
  validateSearch: parseInboxSearch,
  component: InboxPage,
});

function InboxPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const feed = useInboxFeed();
  const todos = useTodoList();
  const info = useSyncInfo();
  const today = useToday();
  const now = useNow();
  const markAll = useMutation(api.inbox.markAllSeen);
  const markSeen = useMutation(api.seenState.markSeen);
  const markUnseen = useMutation(api.seenState.markUnseen);

  const all = useMemo(() => feed ?? [], [feed]);
  const unreadTotal = all.filter((f) => !f.seen).length;

  // Everything the course scope and unread toggle allow; the type tabs count
  // against this, so a tab always says what clicking it shows.
  const scoped = useMemo(
    () =>
      all.filter(
        (f) =>
          (search.course === undefined || f.courseCanvasId === search.course) &&
          (search.unread !== true || !f.seen),
      ),
    [all, search.course, search.unread],
  );
  const counts = useMemo<TypeCounts>(
    () => ({
      all: scoped.length,
      announcement: scoped.filter((f) => f.type === "announcement").length,
      grade: scoped.filter((f) => f.type === "grade").length,
      change: scoped.filter((f) => f.type === "change").length,
      assignment: scoped.filter((f) => f.type === "assignment").length,
    }),
    [scoped],
  );
  const items =
    search.type === undefined ? scoped : scoped.filter((f) => f.type === search.type);

  // Due dates for new-assignment rows: the feed carries points but no date.
  const dueByAssignment = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of todos ?? []) {
      if (t.kind === "assignment" && t.canvasId !== undefined && t.dueAt !== undefined) {
        map.set(t.canvasId, t.dueAt);
      }
    }
    return map;
  }, [todos]);

  // Looked up across the whole feed, not the filtered list: reading an item
  // with "Unread only" on drops it from the list but must not close it.
  const selected = search.item === undefined ? undefined : all.find((f) => f.key === search.item);

  const setSearch = useCallback(
    (patch: Partial<InboxSearch>) => {
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
    },
    [navigate],
  );

  // Opening an item is reading it, however it got opened. Keyed on the
  // selected key so "Mark unread" is not undone on the next render.
  const selectedKey = selected?.key;
  useEffect(() => {
    if (selected === undefined || selected.seen) return;
    void markSeen({
      kind: feedSeenKind(selected.type),
      canvasId: selected.canvasId,
      seenVersion: selected.seenVersion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const onMarkUnread = useCallback(() => {
    if (selected === undefined) return;
    void markUnseen({
      kind: feedSeenKind(selected.type),
      canvasId: selected.canvasId,
    });
  }, [selected, markUnseen]);

  const checked =
    info?.syncing === true
      ? "syncing now"
      : info?.lastSyncedAt !== undefined
        ? `checked ${formatSince(info.lastSyncedAt, now)}`
        : undefined;

  const subtitle = [
    unreadTotal > 0 ? `${unreadTotal} unread` : feed === undefined ? undefined : "All caught up",
    checked,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-full">
      <div className={cn("shrink-0", search.item !== undefined && "hidden lg:block")}>
        <PageHeader
          title="Inbox"
          subtitle={subtitle}
          actions={
            <>
              <div className="hidden items-center gap-4 lg:flex">
                <CourseSelect search={search} onChange={setSearch} />
                <UnreadToggle search={search} onChange={setSearch} />
              </div>
              {unreadTotal > 0 && (
                <button
                  type="button"
                  onClick={() => void markAll()}
                  aria-label="Mark all read"
                  title="Mark all read"
                  className="inline-flex h-8 cursor-pointer items-center gap-[6px] rounded-md px-2 text-[12.5px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none lg:ml-1"
                >
                  <CheckCheck className="size-[15px]" aria-hidden />
                  <span className="hidden sm:inline">Mark all read</span>
                </button>
              )}
            </>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Inbox items"
          className={cn(
            "flex min-w-0 flex-1 flex-col border-line lg:w-[420px] lg:flex-none lg:overflow-y-auto lg:border-r xl:w-[500px] 2xl:w-[560px]",
            search.item !== undefined && "hidden lg:flex",
          )}
        >
          <div className="sticky top-0 z-10 bg-surface">
            <InboxFilters search={search} counts={counts} onChange={setSearch} />
          </div>

          <div className="pb-8">
            {feed === undefined ? (
              <ListSkeleton />
            ) : all.length === 0 ? (
              <Empty
                title="That's everything"
                body="Announcements, posted grades and new assignments show up here."
              />
            ) : items.length === 0 ? (
              <Empty title="No matches" body="Nothing in the feed fits these filters.">
                <button
                  type="button"
                  onClick={() => setSearch({ type: undefined, course: undefined, unread: undefined })}
                  className="mt-1 inline-flex h-7 cursor-pointer items-center rounded-md px-[10px] text-[12.5px] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--line-2)] transition-colors hover:bg-hover hover:text-ink"
                >
                  Clear filters
                </button>
              </Empty>
            ) : (
              groupFeed(items, today, now).map((group) => (
                <section key={group.label} aria-label={group.label}>
                  <h2 className="flex items-baseline justify-between px-4 pt-5 pb-[6px] text-[13px] font-semibold tracking-[-0.01em] text-ink md:px-6">
                    {group.label}
                    <span className="tabular text-[12px] font-normal text-ink-3">{group.items.length}</span>
                  </h2>
                  {group.items.map((f) => (
                    <InboxRow
                      key={f.key}
                      item={f}
                      now={now}
                      dueAt={dueByAssignment.get(f.canvasId)}
                      selected={f.key === search.item}
                    />
                  ))}
                </section>
              ))
            )}
          </div>
        </section>

        <section
          aria-label="Reading pane"
          className={cn(
            "min-w-0 flex-1 lg:overflow-y-auto",
            search.item === undefined && "hidden lg:block",
          )}
        >
          {selected !== undefined ? (
            <InboxDetail
              key={selected.key}
              item={selected}
              dueAt={dueByAssignment.get(selected.canvasId)}
              onMarkUnread={onMarkUnread}
            />
          ) : search.item === undefined ? (
            <DetailEmpty />
          ) : feed === undefined ? (
            <DetailLoading />
          ) : (
            <Empty
              title="Not in the feed"
              body="This item has aged out of the Inbox."
              className="h-full justify-center"
            >
              <Link
                to="/inbox"
                search={(prev) => ({ ...prev, item: undefined })}
                className="mt-1 inline-flex h-7 items-center rounded-md px-[10px] text-[12.5px] font-medium text-ink-2 no-underline shadow-[inset_0_0_0_1px_var(--line-2)] transition-colors hover:bg-hover hover:text-ink"
              >
                Back to Inbox
              </Link>
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}

function Empty({
  title,
  body,
  className,
  children,
}: {
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-10 py-14 text-center", className)}>
      <span className="mb-1 grid size-10 place-items-center rounded-xl border border-line bg-sunken text-ink-3">
        <Inbox className="size-[18px]" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="text-[14px] font-medium text-ink">{title}</span>
      <span className="max-w-[280px] text-[12.5px] leading-[1.55] text-ink-3">{body}</span>
      {children}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="pt-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-[13px] md:px-6">
          <div className="mt-[2px] size-[15px] rounded bg-chip" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-chip" />
            <div className="h-2.5 w-1/3 rounded bg-chip" />
          </div>
        </div>
      ))}
    </div>
  );
}
