import { useInboxFeed, useTodoList } from "@/lib/list-queries";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CountBadge } from "@/components/app/bits";
import { ProfileMenu } from "@/components/app/profile-menu";
import { InboxFilters, type TypeCounts } from "@/components/inbox/filters";
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

  return (
    <div className="flex min-h-0 flex-1 lg:h-full">
      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col border-line lg:w-[46%] lg:max-w-[620px] lg:min-w-[360px] lg:flex-none lg:overflow-y-auto lg:border-r",
          search.item !== undefined && "hidden lg:flex",
        )}
      >
        <header className="flex items-center justify-between gap-5 border-b border-line px-4 py-[14px] lg:sticky lg:top-0 lg:z-10 lg:bg-surface">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
              Inbox
              <CountBadge n={unreadTotal} />
            </div>
            <div className="mt-[3px] truncate text-xs text-ink-3">
              {unreadTotal} unread{checked !== undefined && ` · ${checked}`}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {unreadTotal > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-xs text-ink-3 hover:text-ink"
              >
                Mark all read
              </button>
            )}
            <span className="md:hidden">
              <ProfileMenu variant="avatar" />
            </span>
          </div>
        </header>

        <InboxFilters search={search} counts={counts} onChange={setSearch} />

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
                className="text-[12.5px] font-medium text-ink-2 hover:text-ink"
              >
                Clear filters
              </button>
            </Empty>
          ) : (
            groupFeed(items, today, now).map((group) => (
              <div key={group.label}>
                <div className="eyebrow px-4 pt-[14px] pb-[6px] text-[10.5px]">{group.label}</div>
                {group.items.map((f) => (
                  <InboxRow
                    key={f.key}
                    item={f}
                    now={now}
                    dueAt={dueByAssignment.get(f.canvasId)}
                    selected={f.key === search.item}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </section>

      <section
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
          <Empty title="Not in the feed" body="This item has aged out of the Inbox.">
            <button
              type="button"
              onClick={() => setSearch({ item: undefined })}
              className="text-[12.5px] font-medium text-ink-2 hover:text-ink"
            >
              Back to Inbox
            </button>
          </Empty>
        )}
      </section>
    </div>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-[9px] px-10 py-11 text-center text-ink-3">
      <span className="text-[14px] font-medium text-ink-2">{title}</span>
      <span className="text-[12.5px] leading-[1.5]">{body}</span>
      {children}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-line px-4 py-3">
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
