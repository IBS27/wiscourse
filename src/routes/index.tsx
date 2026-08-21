import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, ChevronRight, Megaphone, Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { TodoItem } from "../../convex/todos";
import { Button } from "@/components/ui/button";
import { CountBadge, Kbd } from "@/components/app/bits";
import { useQuickAdd } from "@/lib/quick-add-context";
import { ProfileMenu } from "@/components/app/profile-menu";
import { SyncStatusLine } from "@/components/app/sync-status";
import { useSyncInfo } from "@/lib/sync-info";
import { AgendaItem } from "@/components/agenda/agenda-item";
import { WeekStrip } from "@/components/agenda/week-strip";
import { FeedCard, NewRail } from "@/components/agenda/new-rail";
import { groupFeed, useFeed } from "@/lib/feed";
import { FirstSyncCard } from "@/components/agenda/first-sync";
import { buildAgenda, agendaDay, isDone, type Bucket } from "@/lib/agenda";
import { dayKeyOf, formatDay, formatDayLong, formatDayMedium } from "@/lib/dates";
import { useNow, useToday } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Home,
});

const LATER_PREVIEW = 3;

function Home() {
  const today = useToday();
  const now = useNow();
  const items = useQuery(api.todos.list, {});
  const info = useSyncInfo();
  const quickAdd = useQuickAdd();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showLater, setShowLater] = useState(false);

  const buckets = items ? buildAgenda(items, { todayKey: today, now }) : undefined;
  const dayItems =
    items && selectedDay ? itemsOnDay(items, selectedDay, today, now) : undefined;
  const showFirstSync = info?.connected === true && info.firstSync;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-end justify-between gap-5 border-b border-line px-4 py-[14px] md:items-center md:px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.015em]">
            <span className="md:hidden">{formatDayMedium(today)}</span>
            <span className="hidden md:inline">{formatDayLong(today)}</span>
          </div>
          <SyncStatusLine className="mt-[3px]" />
        </div>
        <button
          type="button"
          onClick={quickAdd.open}
          className="hidden h-[34px] w-[352px] items-center gap-[9px] rounded-lg border border-line bg-sunken px-[11px] text-[13px] text-ink-3 hover:border-line-2 md:flex"
        >
          <Plus className="size-[14px]" />
          Add a task…
          <Kbd className="ml-auto">N</Kbd>
        </button>
        <div className="flex items-center gap-3 md:hidden">
          <button
            type="button"
            onClick={quickAdd.open}
            aria-label="Add a task"
            className="grid size-8 place-items-center rounded-lg bg-today text-today-fg"
          >
            <Plus className="size-[14px]" />
          </button>
          <ProfileMenu variant="avatar" />
        </div>
      </header>

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

          <div className="pt-[6px] pb-[26px]">
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
                  showLater={showLater}
                  onShowLater={() => setShowLater(true)}
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
  showLater,
  onShowLater,
}: {
  bucket: Bucket;
  todayKey: string;
  now: number;
  showLater: boolean;
  onShowLater: () => void;
}) {
  if (bucket.items.length === 0 && bucket.id !== "today") return null;
  const isLater = bucket.id === "later";
  const visible = isLater && !showLater ? bucket.items.slice(0, LATER_PREVIEW) : bucket.items;
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
      empty={bucket.id === "today" ? "Nothing due or planned today." : undefined}
      footer={
        hidden > 0 ? (
          <button
            type="button"
            onClick={onShowLater}
            className="flex items-center gap-[6px] px-5 py-[11px] text-[12.5px] text-ink-3 hover:text-ink"
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
      <div className="flex items-center gap-2 px-4 pt-4 pb-[7px] md:px-5">
        <span className={cn("text-[11.5px] font-semibold tracking-[0.09em] uppercase", red && "text-red")}>{title}</span>
        {detail && <span className="text-[11.5px] tracking-[0.01em] text-ink-3">{detail}</span>}
        {action ?? <span className="ml-auto text-[11px] font-semibold text-ink-3">{count ?? items.length}</span>}
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-3 text-[12.5px] text-ink-3 md:px-5">{empty}</div>
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
  const feed = useFeed();
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
        className="flex w-full items-center gap-[9px] border-b border-line bg-sunken px-4 py-[11px] text-[13px] font-medium"
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
              <div className="eyebrow px-[14px] pt-[6px] pb-1 text-[10.5px]">{g.label}</div>
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
