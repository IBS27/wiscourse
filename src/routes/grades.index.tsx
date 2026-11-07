import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { BarChart3 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Gradebook } from "../../convex/lib/grades";
import { PageHeader } from "@/components/app/page-header";
import { LedgerFold } from "@/components/course/ledger-fold";
import { LedgerPastTerms } from "@/components/course/ledger-past";
import {
  GradesLedgerHeader,
  GradesLedgerRow,
  GradesPastRow,
} from "@/components/grades/ledger-row";
import { formatSince } from "@/lib/dates";
import { useCourses, useNow, useToday, type Course } from "@/lib/hooks";
import { useSyncInfo } from "@/lib/sync-info";

export const Route = createFileRoute("/grades/")({
  component: GradesIndex,
});

function GradesIndex() {
  const { loading, courses, visible, other, past, termName, color } = useCourses();
  // One subscription for the whole page; every row reads its book from it.
  const books = useQuery(api.grades.index);
  const info = useSyncInfo();
  const today = useToday();
  const now = useNow();

  const byCourse = useMemo(() => {
    const map = new Map<number, Gradebook>();
    for (const entry of books ?? []) map.set(entry.courseCanvasId, entry.book);
    return map;
  }, [books]);

  const rows = (list: Course[]) =>
    list.map((course) => (
      <GradesLedgerRow
        key={course.canvasId}
        course={course}
        color={color(course.canvasId)}
        book={byCourse.get(course.canvasId)}
        today={today}
      />
    ));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader
        contentClassName="max-w-[1080px]"
        title="Grades"
        subtitle={subtitle(termName, visible.length, info?.lastSyncedAt, now)}
      />

      {/* Capped and left on the gutter, so values sit near their names on wide screens. */}
      <div className="w-full md:max-w-[1128px]">
        {loading || books === undefined ? (
          <LedgerSkeleton />
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <BarChart3 className="size-5 text-ink-3" aria-hidden />
            <p className="text-[13.5px] font-medium">No courses yet</p>
            <p className="text-[12.5px] text-ink-3">
              Connect Canvas in{" "}
              <Link to="/settings" className="font-medium text-ink-2 underline underline-offset-4 hover:text-ink">
                Settings
              </Link>
              , then run a sync.
            </p>
          </div>
        ) : (
          <>
            {visible.length > 0 && <GradesLedgerHeader />}
            {rows(visible)}
            {visible.length === 0 && (
              <p className="px-4 py-6 text-[13px] text-ink-3 md:px-6">
                No courses in the current term.
              </p>
            )}
            {other.length > 0 && (
              <LedgerFold
                label="Other"
                count={other.length}
                hint="Orientation, advising and student-org courses"
              >
                {rows(other)}
              </LedgerFold>
            )}
            <LedgerPastTerms
              courses={past}
              color={color}
              renderRow={(course) => (
                <GradesPastRow
                  key={course.canvasId}
                  course={course}
                  color={color(course.canvasId)}
                />
              )}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** "Fall 2026 · 4 courses · synced 2 minutes ago" — the parts we know. */
function subtitle(
  termName: string | undefined,
  count: number,
  lastSyncedAt: number | undefined,
  now: number,
): string | undefined {
  const parts = [
    termName,
    count > 0 ? `${count} course${count === 1 ? "" : "s"}` : undefined,
    lastSyncedAt === undefined ? undefined : `synced ${formatSince(lastSyncedAt, now)}`,
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(" · ");
}

function LedgerSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex h-16 items-center gap-8 border-b border-line px-4 md:px-6">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-chip" />
            <div className="h-2.5 w-1/5 rounded bg-chip" />
          </div>
          <div className="h-3 w-16 rounded bg-chip" />
        </div>
      ))}
    </div>
  );
}
