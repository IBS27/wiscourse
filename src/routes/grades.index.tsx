import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
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
import { openSearch } from "@/lib/search-context";
import { useSeen } from "@/lib/seen";
import { useSyncInfo } from "@/lib/sync-info";

export const Route = createFileRoute("/grades/")({
  component: GradesIndex,
});

function GradesIndex() {
  const { loading, courses, visible, other, past, termName, color } = useCourses();
  // One subscription for the whole page; every row reads its book from it.
  const books = useQuery(api.grades.index);
  const seen = useSeen("grade");
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
        seen={seen}
        today={today}
      />
    ));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader
        title="Grades"
        subtitle={subtitle(termName, visible.length, info?.lastSyncedAt, now)}
        actions={
          <button
            type="button"
            aria-label="Search"
            onClick={() => openSearch()}
            className="text-ink-3 md:hidden"
          >
            <Search className="size-[18px]" />
          </button>
        }
      />

      {loading || books === undefined ? (
        <LedgerSkeleton />
      ) : courses.length === 0 ? (
        <p className="p-4 text-sm text-ink-3 md:p-5">
          No courses yet. Connect Canvas in{" "}
          <Link to="/settings" className="font-medium text-ink underline underline-offset-4">
            Settings
          </Link>
          , then run a sync.
        </p>
      ) : (
        <>
          {visible.length > 0 && <GradesLedgerHeader />}
          {rows(visible)}
          {visible.length === 0 && (
            <p className="p-4 text-[13px] text-ink-3 md:p-5">
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
        <div key={i} className="flex h-[60px] items-center gap-3 border-b border-line px-4 md:px-5">
          <div className="size-2 rounded-full bg-chip" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-chip" />
            <div className="h-2.5 w-1/4 rounded bg-chip" />
          </div>
          <div className="h-3 w-14 rounded bg-chip" />
        </div>
      ))}
    </div>
  );
}
