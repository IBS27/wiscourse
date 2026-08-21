import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FeedItem } from "../../convex/inbox";
import { addDays, dayKeyOf } from "./dates";

export function useFeed() {
  return useQuery(api.inbox.feed);
}

export function groupFeed(feed: FeedItem[], todayKey: string, now: number) {
  const groups: { label: string; items: FeedItem[] }[] = [];
  const yesterday = addDays(todayKey, -1);
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  for (const f of feed) {
    const day = dayKeyOf(f.at);
    const label =
      day === todayKey ? "Today" : day === yesterday ? "Yesterday" : f.at >= weekAgo ? "This week" : "Earlier";
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(f);
    else groups.push({ label, items: [f] });
  }
  return groups;
}
