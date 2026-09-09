import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { PageHeader } from "@/components/app/page-header";
import { LedgerRow } from "@/components/course/ledger-row";
import { LedgerPastTerms } from "@/components/course/ledger-past";
import { LedgerFold } from "@/components/course/ledger-fold";
import { formatSince } from "@/lib/dates";
import { useCourses, useNow, type Course } from "@/lib/hooks";
import { openSearch } from "@/lib/search-context";
import { useSyncInfo } from "@/lib/sync-info";

export const Route = createFileRoute("/courses/")({
  component: CoursesIndex,
});

function CoursesIndex() {
  const { loading, courses, visible, other, past, termName, color } = useCourses();
  const todos = useQuery(api.todos.list, {});
  const feed = useQuery(api.inbox.feed);
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
        <p className="p-4 text-sm text-ink-3 md:p-5">
          No courses yet. Connect Canvas in{" "}
          <Link to="/settings" className="font-medium text-ink underline underline-offset-4">
            Settings
          </Link>
          , then run a sync.
        </p>
      ) : (
        <>
          {visible.length > 0 && (
            <div className="hidden h-8 grid-cols-[minmax(0,1fr)_250px_230px] items-center gap-x-4 border-b border-line px-5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase md:grid">
              <span>Course</span>
              <span>Next due</span>
              <span>New</span>
            </div>
          )}
          {rows(visible)}
          {visible.length === 0 && (
            <p className="p-4 text-[13px] text-ink-3 md:p-5">
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
        <div key={i} className="flex h-[58px] items-center gap-3 border-b border-line px-4 md:px-5">
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
