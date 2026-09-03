import { useQuery } from "convex/react";
import { ChevronRight, Clock } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { TodoItem } from "../../../convex/todos";
import { OverviewRow, SectionHead } from "./overview-row";
import {
  contentItems,
  fileMeta,
  itemCountLabel,
  itemIcon,
  itemTarget,
  lockReason,
  weekNumberInName,
  type ModuleDoc,
  type ModuleItemDoc,
  type ModuleWithItems,
} from "./module-utils";
import { moduleHref, modulesHref } from "@/lib/course-routes";
import { dayKeyOf, formatDueRelative, formatWeekRange, startOfMondayWeek } from "@/lib/dates";
import { useSeen } from "@/lib/seen";

/**
 * "This week": the one module a student is in, opened inline, plus a line
 * each for what is locked and what is behind them.
 */
export function OverviewWeek({
  courseId,
  canvasId,
  modules,
  todos,
  todayKey,
}: {
  courseId: string;
  canvasId: number;
  modules: ModuleWithItems[] | undefined;
  todos: TodoItem[] | undefined;
  todayKey: string;
}) {
  // The whole listing, because a File row's meta is its type and size. The
  // Files tab and the module context share this subscription.
  const tree = useQuery(api.files.tree, { courseCanvasId: canvasId });
  const seen = useSeen("moduleItem");

  if (modules === undefined) return null;
  if (modules.length === 0) {
    return (
      <section>
        <SectionHead title="This week" />
        <div className="px-4 pb-3 text-[12.5px] text-ink-3 md:px-5">
          This course doesn’t publish modules. Try Files or the Syllabus.
        </div>
      </section>
    );
  }

  const isUnread = (item: ModuleItemDoc) =>
    !seen.has(item.canvasId) && item.completionRequirement?.completed !== true;
  const current = pickCurrent(modules, todayKey, isUnread);
  const index = modules.findIndex((m) => m.canvasId === current.canvasId);
  const nextLocked = modules.slice(index + 1).find((m) => m.state === "locked");
  const earlier = modules.slice(0, index);
  const byId = new Map<number, ModuleDoc>(modules.map((m) => [m.canvasId, m]));

  const items = contentItems(current.items);
  const viewed = items.filter((item) => !isUnread(item)).length;
  const files = new Map((tree?.files ?? []).map((f) => [f.canvasId, f]));
  const dueByCanvasId = new Map(
    (todos ?? [])
      .filter((t) => t.canvasId !== undefined && t.dueAt !== undefined)
      .map((t) => [t.canvasId as number, t.dueAt as number]),
  );

  return (
    <section>
      <SectionHead
        title="This week"
        detail={[current.name, weekRange(current.unlockAt)].filter(Boolean).join(" · ")}
        right={items.length > 0 ? `${viewed} of ${items.length} viewed` : undefined}
        className="pt-[22px]"
      />
      {current.items.length === 0 && (
        <div className="px-4 pb-3 text-[12.5px] text-ink-3 md:px-5">Nothing published yet.</div>
      )}
      {current.items.map((item) => {
        if (item.type === "SubHeader") {
          return (
            <div
              key={item.canvasId}
              className="border-b border-line py-2 pr-4 pl-9 text-[11px] font-semibold tracking-[0.09em] text-ink-3 uppercase md:pr-5"
            >
              {item.title}
            </div>
          );
        }
        const target = itemTarget(item, courseId);
        return (
          <OverviewRow
            key={item.canvasId}
            icon={itemIcon(item, files)}
            title={item.title}
            unread={isUnread(item)}
            meta={itemMeta(item, files, dueByCanvasId, todayKey)}
            to={target.kind === "internal" ? rowHref(target.to, target.search) : undefined}
            href={target.kind === "external" ? target.href : undefined}
            onClick={() => seen.mark(item.canvasId)}
          />
        );
      })}

      {nextLocked !== undefined && (
        <OverviewRow
          icon={Clock}
          title={nextLocked.name}
          className="text-ink-3"
          meta={`${lockReason(nextLocked, byId)} · ${itemCountLabel(nextLocked)}`}
          to={moduleHref(courseId, nextLocked.canvasId)}
        />
      )}

      {earlier.length > 0 && (
        <SectionHead
          title="Earlier"
          muted
          detail={earlierDetail(earlier, isUnread)}
          right={<ChevronRight className="size-[13px]" aria-hidden />}
          to={modulesHref(courseId)}
          className="pt-[22px]"
        />
      )}
    </section>
  );
}

/** `OverviewRow` takes one href, so the file search param folds back in. */
function rowHref(to: string, search: { file: number } | undefined): string {
  return search === undefined ? to : `${to}?file=${search.file}`;
}

function pickCurrent(
  modules: ModuleWithItems[],
  todayKey: string,
  isUnread: (item: ModuleItemDoc) => boolean,
): ModuleWithItems {
  const thisWeek = startOfMondayWeek(todayKey);
  const dated = modules.find(
    (m) => m.unlockAt !== undefined && startOfMondayWeek(dayKeyOf(m.unlockAt)) === thisWeek,
  );
  if (dated !== undefined) return dated;

  const unlocked = modules.filter((m) => m.state !== "locked");
  const pool = unlocked.length > 0 ? unlocked : modules;
  for (let i = pool.length - 1; i >= 0; i--) {
    if (contentItems(pool[i].items).some(isUnread)) return pool[i];
  }
  return pool[pool.length - 1];
}

/** "Aug 24 – 28" — the teaching week the module unlocks in. */
function weekRange(unlockAt: number | undefined): string | undefined {
  return unlockAt === undefined
    ? undefined
    : formatWeekRange(startOfMondayWeek(dayKeyOf(unlockAt)));
}

function itemMeta(
  item: ModuleItemDoc,
  files: Map<number, { filename: string; size: number }>,
  dueByCanvasId: Map<number, number>,
  todayKey: string,
): string | undefined {
  const content = item.contentCanvasId;
  switch (item.type) {
    case "Page":
      return "Page";
    case "File": {
      const file = content === undefined ? undefined : files.get(content);
      return file === undefined ? "File" : fileMeta(file);
    }
    case "Assignment":
    case "Quiz":
    case "Discussion": {
      const due = content === undefined ? undefined : dueByCanvasId.get(content);
      return due === undefined ? item.type : `Due ${formatDueRelative(due, todayKey)}`;
    }
    default:
      return "Opens in Canvas";
  }
}

/** "Weeks 1–3 · all viewed" when the names carry week numbers. */
function earlierDetail(
  earlier: ModuleWithItems[],
  isUnread: (item: ModuleItemDoc) => boolean,
): string {
  const unread = earlier.reduce((n, m) => n + contentItems(m.items).filter(isUnread).length, 0);
  const state = unread === 0 ? "all viewed" : `${unread} unread`;
  const weeks = earlier
    .map((m) => weekNumberInName(m.name))
    .filter((n): n is number => n !== undefined);
  if (weeks.length === earlier.length && weeks.length > 0) {
    const lo = Math.min(...weeks);
    const hi = Math.max(...weeks);
    return `${lo === hi ? `Week ${lo}` : `Weeks ${lo}–${hi}`} · ${state}`;
  }
  return `${earlier.length} module${earlier.length === 1 ? "" : "s"} · ${state}`;
}
