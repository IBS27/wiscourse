import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FeedItem } from "../../convex/inbox";
import {
  formatChange,
  percent,
  pointsLabel,
  scoreOf,
  shortDateTime,
} from "@/components/inbox/format";
import type { SeenKind } from "./seen";
import { addDays, dayKeyOf } from "./dates";

export function useFeed() {
  return useQuery(api.inbox.feed);
}

// Announcements are discussions; grades and new assignments share the
// assignment row (the version keeps them apart); changes get one row per
// `changedAt`.
export function feedSeenKind(type: FeedItem["type"]): SeenKind {
  if (type === "announcement") return "discussion";
  if (type === "change") return "assignmentChange";
  return "assignment";
}

/** "Homework 3 graded — 47/50", "Problem Set 4 due date moved", … */
export function feedTitle(item: FeedItem): string {
  if (item.type === "grade") {
    const score =
      item.score !== undefined && item.pointsPossible !== undefined
        ? ` — ${scoreOf(item.score, item.pointsPossible)}`
        : "";
    return `${item.title} graded${score}`;
  }
  if (item.type === "change") {
    return `${item.title} ${item.change ? formatChange(item.change).verb : "updated"}`;
  }
  if (item.type === "assignment") return `New assignment — ${item.title}`;
  return item.title;
}

/** The second line. `dueAt` comes from the todo list, which the feed omits. */
export function feedSubtitle(item: FeedItem, dueAt?: number): string | undefined {
  if (item.type === "announcement") return item.subtitle;
  if (item.type === "change") {
    return item.change ? formatChange(item.change).summary : item.subtitle;
  }
  if (item.type === "assignment") {
    return join([
      dueAt === undefined ? undefined : `Due ${shortDateTime(dueAt)}`,
      pointsLabel(item.pointsPossible),
    ]);
  }
  const pct =
    item.score !== undefined && item.pointsPossible !== undefined
      ? percent(item.score, item.pointsPossible)
      : undefined;
  const letter =
    item.grade !== undefined && item.grade !== String(item.score) ? item.grade : undefined;
  return join([pct, letter]) ?? "Grade posted";
}

function join(parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((p): p is string => p !== undefined && p !== "");
  return kept.length === 0 ? undefined : kept.join(" · ");
}

export function groupFeed(feed: FeedItem[], todayKey: string, now: number) {
  const groups: { label: string; items: FeedItem[] }[] = [];
  const yesterday = addDays(todayKey, -1);
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  for (const f of feed) {
    const day = dayKeyOf(f.at);
    const label =
      day === todayKey
        ? "Today"
        : day === yesterday
          ? "Yesterday"
          : f.at >= weekAgo
            ? "This week"
            : "Earlier";
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(f);
    else groups.push({ label, items: [f] });
  }
  return groups;
}
