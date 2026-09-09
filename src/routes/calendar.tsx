import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/calendar")({
  component: Calendar,
});

const DAY_MS = 24 * 60 * 60 * 1000;

function Calendar() {
  // Stable range so the query subscription does not churn on re-render.
  const [range] = useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { start: start.getTime(), end: start.getTime() + 30 * DAY_MS };
  });
  const events = useQuery(api.calendar.range, range);

  const byDay = new Map<string, NonNullable<typeof events>>();
  for (const event of events ?? []) {
    const key = formatDate(event.startAt);
    const dayEvents = byDay.get(key);
    if (dayEvents) dayEvents.push(event);
    else byDay.set(key, [event]);
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Calendar" />
      <div className="space-y-6 p-4 md:p-6">
      <p className="text-sm text-muted-foreground">Next 30 days</p>

      {events === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No events in the next 30 days.
        </p>
      ) : (
        <div className="space-y-5">
          {[...byDay.entries()].map(([day, dayEvents]) => (
            <section key={day} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {day}
              </h2>
              <ul className="space-y-2">
                {dayEvents.map((event) => (
                  <li
                    key={event._id}
                    className="flex items-center justify-between gap-4 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{event.title}</p>
                      {event.location && (
                        <p className="truncate text-sm text-muted-foreground">
                          {event.location}
                        </p>
                      )}
                    </div>
                    <Badge variant={event.source === "canvas" ? "secondary" : "outline"}>
                      {event.source}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
