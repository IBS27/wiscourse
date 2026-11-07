import { useInboxFeed, useTodoList } from "@/lib/list-queries";
import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ChevronDown, ChevronRight, Megaphone, Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { TodoItem } from "../../convex/todos";
import { Button } from "@/components/ui/button";
import { CountBadge, Kbd } from "@/components/app/bits";
import { useQuickAdd } from "@/lib/quick-add-context";
import { HEADER_BUTTON, PageHeader } from "@/components/app/page-header";
import { SyncStatusLine } from "@/components/app/sync-status";
import { useSyncInfo } from "@/lib/sync-info";
import { AgendaItem } from "@/components/agenda/agenda-item";
import { WeekStrip } from "@/components/agenda/week-strip";
import { FeedCard, NewRail } from "@/components/agenda/new-rail";
import { groupFeed } from "@/lib/feed";
import { FirstSyncCard } from "@/components/agenda/first-sync";
import { buildAgenda, agendaDay, isDone, type Bucket } from "@/lib/agenda";
import { dayKeyOf, formatDay, formatDayLong, formatDayMedium } from "@/lib/dates";
import { useNow, useToday } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Home,
});

// Long buckets show a few rows and fold the rest, so an overdue backlog never
// pushes today's work below the fold.
const PREVIEW: Partial<Record<Bucket["id"], number>> = { overdue: 3, later: 3 };

function Home() {
  const today = useToday();
  const now = useNow();
  const items = useTodoList();
  const info = useSyncInfo();
  const quickAdd = useQuickAdd();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<Bucket["id"]>>(new Set());

  const buckets = items ? buildAgenda(items, { todayKey: today, now }) : undefined;
  const dayItems =
    items && selectedDay ? itemsOnDay(items, selectedDay, today, now) : undefined;
  const showFirstSync = info?.connected === true && info.firstSync;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Top bar */}
      <PageHeader
        title={
          <>
            <span className="md:hidden">{formatDayMedium(today)}</span>
            <span className="hidden md:inline">{formatDayLong(today)}</span>
          </>
        }
        subtitle={<SyncStatusLine />}
        actions={
          <>
            <button
              type="button"
              onClick={quickAdd.open}
              className="hidden h-9 w-[320px] items-center gap-[9px] rounded-lg border border-line bg-sunken px-3 text-[13px] text-ink-3 transition-colors hover:border-line-2 hover:text-ink-2 md:flex"
            >
              <Plus className="size-[14px]" />
              Add a task…
              <Kbd className="ml-auto">N</Kbd>
            </button>
            <button
              type="button"
              onClick={quickAdd.open}
              aria-label="Add a task"
              className={cn(HEADER_BUTTON, "md:hidden")}
            >
              <Plus className="size-[16px]" />
            </button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {info?.connected === false && <ConnectCard />}
          {showFirstSync && <FirstSyncCard syncing={info.syncing} />}

          {items && (
            <WeekStrip
              items={items}
              todayKey={today}
              now={now}
              selected={selectedDay}
              onSelect={setSelectedDay}
            />
          )}

          <MobileNew todayKey={today} now={now} />

          <div className="pt-0 pb-[26px] md:pt-[6px]">
            {items === undefined ? (
              <AgendaSkeleton />
            ) : dayItems ? (
              <Section
                title={selectedDay === today ? "Today" : formatDay(selectedDay!)}
                detail={selectedDay === today ? formatDay(today) : undefined}
                items={dayItems}
                todayKey={today}
                now={now}
                empty="Nothing on this day."
                action={
                  <button type="button" onClick={() => setSelectedDay(null)} className="ml-auto text-[11px] font-semibold text-ink-3 hover:text-ink">
                    Back to agenda
                  </button>
                }
              />
            ) : (
              buckets!.map((b) => (
                <BucketSection
                  key={b.id}
                  bucket={b}
                  todayKey={today}
                  now={now}
                  expanded={expanded.has(b.id)}
                  onExpand={() => setExpanded((prev) => new Set(prev).add(b.id))}
                  // Something due earlier today already sits in Overdue.
                  slippedToday={buckets!.some(
                    (x) => x.id === "overdue" && x.items.some((it) => it.dueAt !== undefined && dayKeyOf(it.dueAt) === today),
                  )}
                />
              ))
            )}
            {buckets && buckets.every((b) => b.items.length === 0) && info?.connected && !showFirstSync && (
              <div className="flex flex-col items-center gap-[9px] px-10 py-11 text-center text-ink-3">
                <span className="text-[14px] font-medium text-ink-2">All clear</span>
                <span className="text-[12.5px] leading-[1.5]">
                  Nothing due or planned. Press <Kbd>N</Kbd> to add a task.
                </span>
              </div>
            )}
          </div>
        </div>

        <NewRail todayKey={today} now={now} />
      </div>
    </div>
  );
}

function itemsOnDay(items: TodoItem[], day: string, todayKey: string, now: number): TodoItem[] {
  return items.filter((it) => {
    if (isDone(it)) return it.doneAt !== undefined && dayKeyOf(it.doneAt) === day;
    const d = agendaDay(it, todayKey, now);
    return d === day || (it.dueAt !== undefined && dayKeyOf(it.dueAt) === day);
  });
}

function BucketSection({
  bucket,
  todayKey,
  now,
  expanded,
  onExpand,
  slippedToday,
}: {
  bucket: Bucket;
  todayKey: string;
  now: number;
  expanded: boolean;
  onExpand: () => void;
  slippedToday: boolean;
}) {
  if (bucket.items.length === 0 && bucket.id !== "today") return null;
  const limit = PREVIEW[bucket.id];
  const visible = limit !== undefined && !expanded ? bucket.items.slice(0, limit) : bucket.items;
  const hidden = bucket.items.length - visible.length;
  return (
    <Section
      title={bucket.title}
      detail={bucket.detail}
      items={visible}
      count={bucket.items.length}
      todayKey={todayKey}
      now={now}
      red={bucket.id === "overdue"}
      empty={bucket.id === "today" ? (slippedToday ? "Nothing else due or planned today." : "Nothing due or planned today.") : undefined}
      footer={
        hidden > 0 ? (
          <button
            type="button"
            onClick={onExpand}
            className="flex items-center gap-[6px] px-4 py-[11px] text-[12.5px] font-medium text-ink-3 hover:text-ink md:px-6"
          >
            Show {hidden} more
            <ChevronRight className="size-[13px]" />
          </button>
        ) : undefined
      }
    />
  );
}

function Section({
  title,
  detail,
  items,
  count,
  todayKey,
  now,
  red,
  empty,
  footer,
  action,
}: {
  title: string;
  detail?: string;
  items: TodoItem[];
  count?: number;
  todayKey: string;
  now: number;
  red?: boolean;
  empty?: string;
  footer?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 px-4 pt-3 pb-[6px] md:px-6 md:pt-6 md:pb-2">
        <h2 className={cn("text-[13px] font-semibold tracking-[-0.005em] text-ink", red && "text-red")}>{title}</h2>
        {detail && <span className="text-[12.5px] text-ink-3">{detail}</span>}
        {action ?? <span className="ml-auto text-[12px] font-medium text-ink-3 tabular">{count ?? items.length}</span>}
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-1 text-[13px] text-ink-3 md:px-6 md:py-2">{empty}</div>
      ) : (
        items.map((item, i) => (
          <AgendaItem key={item.key} item={item} first={i === 0} todayKey={todayKey} now={now} />
        ))
      )}
      {footer}
    </section>
  );
}

function MobileNew({ todayKey, now }: { todayKey: string; now: number }) {
  const feed = useInboxFeed();
  const markAll = useMutation(api.inbox.markAllSeen);
  const [open, setOpen] = useState(false);
  const unseen = feed?.filter((f) => !f.seen) ?? [];
  if (!feed || unseen.length === 0) return null;
  const groups = groupFeed(unseen.slice(0, 8), todayKey, now);
  return (
    <div className="xl:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center gap-[9px] border-b border-line px-4 text-[13px] font-semibold"
      >
        <Megaphone className="size-[14px]" />
        New
        <CountBadge n={unseen.length} />
        {open ? <ChevronDown className="ml-auto size-[14px] text-ink-3" /> : <ChevronRight className="ml-auto size-[14px] text-ink-3" />}
      </button>
      {open && (
        <div className="border-b border-line bg-sunken pt-2 pb-1">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-4 pt-2 pb-[6px] text-[12px] font-medium text-ink-3">{g.label}</div>
              {g.items.map((f) => (
                <FeedCard key={f.key} item={f} now={now} />
              ))}
            </div>
          ))}
          <div className="flex items-center justify-between px-[14px] py-2 text-xs text-ink-3">
            <Link to="/inbox" className="hover:text-ink">Open Inbox</Link>
            <button type="button" onClick={() => void markAll()} className="hover:text-ink">Mark all read</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectCard() {
  return (
    <div className="mx-4 mt-4 flex items-center justify-between gap-4 rounded-[10px] border border-line bg-surface p-4">
      <div>
        <div className="text-[14px] font-semibold tracking-[-0.01em]">Connect Canvas</div>
        <div className="mt-[3px] text-[12.5px] text-ink-3">
          Link your Canvas account to sync courses, assignments, and deadlines.
        </div>
      </div>
      <Button asChild size="sm">
        <Link to="/settings">Connect</Link>
      </Button>
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div className="space-y-px px-0 pt-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-5 py-3">
          <div className="size-[17px] rounded-full bg-chip" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-chip" />
            <div className="h-2.5 w-1/3 rounded bg-chip" />
          </div>
        </div>
      ))}
    </div>
  );
}
