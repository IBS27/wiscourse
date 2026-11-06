import { useInboxFeed, useTodoList } from "@/lib/list-queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Search } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { LEDGER_COLS, LedgerRow } from "@/components/course/ledger-row";
import { LedgerPastTerms } from "@/components/course/ledger-past";
import { LedgerFold } from "@/components/course/ledger-fold";
import { formatSince } from "@/lib/dates";
import { useCourses, useNow, type Course } from "@/lib/hooks";
import { openSearch } from "@/lib/search-context";
import { useSyncInfo } from "@/lib/sync-info";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/courses/")({
  component: CoursesIndex,
});

function CoursesIndex() {
  const { loading, courses, visible, other, past, termName, color } = useCourses();
  const todos = useTodoList();
  const feed = useInboxFeed();
  const info = useSyncInfo();
  const now = useNow();

  const rows = (list: Course[]) =>
    list.map((course) => (
      <LedgerRow
        key={course.canvasId}
        course={course}
        color={color(course.canvasId)}
        todos={todos}
        feed={feed}
        now={now}
      />
    ));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader
        title="Courses"
        subtitle={subtitle(termName, visible, info?.lastSyncedAt, now)}
        actions={
          // Desktop has ⌘K in the sidebar; on mobile this is the only way in.
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

      {loading ? (
        <LedgerSkeleton />
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
          <BookOpen className="size-5 text-ink-3" aria-hidden />
          <p className="text-[13px] text-ink-2">No courses yet.</p>
          <p className="text-[12.5px] text-ink-3">
            Connect Canvas in{" "}
            <Link to="/settings" className="font-medium text-ink underline underline-offset-4">
              Settings
            </Link>
            , then run a sync.
          </p>
        </div>
      ) : (
        <>
          {visible.length > 0 && (
            <div
              className={cn(
                "hidden h-9 items-center gap-x-8 border-b border-line pr-6 pl-[44px] text-[12px] font-medium text-ink-3 md:grid",
                LEDGER_COLS,
              )}
            >
              <span>Course</span>
              <span>Next due</span>
              <span>New</span>
            </div>
          )}
          {rows(visible)}
          {visible.length === 0 && (
            <p className="px-4 py-6 text-[13px] text-ink-3 md:px-6">
              {other.length > 0
                ? "No courses in the current term."
                : "Every course this term is hidden. Unhide one in Settings."}
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
          <LedgerPastTerms courses={past} color={color} />
        </>
      )}
    </div>
  );
}

/** "Fall 2026 · 4 courses · synced 2 minutes ago" — the parts we know. */
function subtitle(
  termName: string | undefined,
  visible: Course[],
  lastSyncedAt: number | undefined,
  now: number,
): string | undefined {
  const parts = [
    termName,
    visible.length > 0 ? `${visible.length} course${visible.length === 1 ? "" : "s"}` : undefined,
    lastSyncedAt === undefined ? undefined : `synced ${formatSince(lastSyncedAt, now)}`,
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(" · ");
}

function LedgerSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex h-[62px] items-center gap-3 border-b border-line px-4 md:px-6">
          <div className="size-2 rounded-full bg-chip" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-chip" />
            <div className="h-2.5 w-1/4 rounded bg-chip" />
          </div>
        </div>
      ))}
    </div>
  );
}
