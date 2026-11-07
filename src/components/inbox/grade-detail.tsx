import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import { Meter } from "@/components/grades/bits";
import { CanvasHtml } from "@/components/reader/canvas-html";
import { todoHref } from "@/lib/course-routes";
import { formatLate, formatMonthDay } from "@/lib/dates";
import { formatPercent, formatPoints } from "@/lib/grades-ui";
import {
  Action,
  BlockLabel,
  ByLine,
  CanvasButton,
  DESCRIPTION,
  DetailShell,
  Initials,
  MarkUnreadButton,
} from "./detail-shell";
import { percent, scoreOf, shortDateTime } from "./format";

// Every number here is gated on `postedAt` by `inbox.gradeDetail`.
export function GradeDetail({
  item,
  onMarkUnread,
}: {
  item: FeedItem;
  onMarkUnread: () => void;
}) {
  const detail = useQuery(api.inbox.gradeDetail, { assignmentCanvasId: item.canvasId });
  // The same reads the to-do detail makes: dates and the assignment's own text.
  const todo = useQuery(api.todos.get, { ref: { kind: "assignment", canvasId: item.canvasId } });
  const description = useQuery(api.todos.description, { kind: "assignment", canvasId: item.canvasId });

  const score = detail?.score ?? item.score;
  const points = detail?.pointsPossible ?? item.pointsPossible;
  const grade = detail?.grade ?? item.grade;
  const grader = detail?.comments[0]?.authorName;
  const postedAt = detail?.postedAt ?? item.at;
  const group = detail?.group;
  const courseScore = detail?.course.currentScore;
  const dueAt = todo?.dueAt;
  const submittedAt = todo?.submittedAt;

  return (
    <DetailShell
      item={item}
      kind={
        score !== undefined && points !== undefined ? (
          <>
            Graded <span className="tabular font-medium text-ink-2">{scoreOf(score, points)}</span>
          </>
        ) : (
          "Grade posted"
        )
      }
      title={item.title}
      by={<ByLine name={grader} when={`Posted ${shortDateTime(postedAt)}`} />}
      actions={
        <>
          <Action primary asChild>
            <Link to={todoHref("assignment", item.canvasId)}>Open assignment</Link>
          </Action>
          <Action asChild>
            <Link to="/grades/$courseId" params={{ courseId: String(item.courseCanvasId) }}>
              Course grades
            </Link>
          </Action>
          <CanvasButton href={detail?.htmlUrl ?? item.htmlUrl}>Submission in Canvas</CanvasButton>
          <MarkUnreadButton onClick={onMarkUnread} disabled={!item.seen} />
        </>
      }
    >
      {/* Some posted grades carry no score at all (feedback-only drafts): then the comments lead. */}
      {(score !== undefined || grade !== undefined) && (
        <ScoreCard score={score} points={points} grade={grade} stats={detail?.scoreStatistics} />
      )}

      <BlockLabel>Details</BlockLabel>
      <dl className="tabular divide-y divide-line border-y border-line">
        {group !== undefined && (
          <Property label="Counts toward">
            {group.name}
            {group.weight !== undefined && group.weight > 0 && (
              <Quiet> · {formatPoints(group.weight)}% of course grade</Quiet>
            )}
          </Property>
        )}
        {courseScore !== undefined && (
          <Property label="Current grade">
            {formatPercent(courseScore)}
            {detail?.course.currentGrade !== undefined && ` · ${detail.course.currentGrade}`}
          </Property>
        )}
        <Property label="Due">
          {dueAt === undefined ? (todo === undefined ? "…" : <Quiet>No due date</Quiet>) : shortDateTime(dueAt)}
        </Property>
        {submittedAt !== undefined && (
          <Property label="Submitted">
            {shortDateTime(submittedAt)}
            {dueAt !== undefined && submittedAt > dueAt + 60_000 && (
              <Quiet> · {formatLate(dueAt, submittedAt)}</Quiet>
            )}
          </Property>
        )}
      </dl>

      {detail !== undefined && detail !== null && detail.comments.length > 0 && (
        <>
          <BlockLabel>Grader comments</BlockLabel>
          <div className="space-y-[10px]">
            {detail.comments.map((c, i) => (
              <div key={`${c.createdAt}-${i}`} className="rounded-xl bg-sunken px-4 py-3">
                <div className="mb-[6px] flex items-center gap-2 text-[12.5px] text-ink-3">
                  <Initials name={c.authorName} />
                  <span className="font-medium text-ink-2">{c.authorName}</span>
                  <span aria-hidden>·</span>
                  <span className="tabular">{formatMonthDay(c.createdAt)}</span>
                </div>
                <p className="text-[14px] leading-[1.6] whitespace-pre-wrap text-ink">{c.comment}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {typeof description === "string" && description.trim() !== "" && (
        <>
          <BlockLabel>Assignment</BlockLabel>
          <CanvasHtml html={description} courseId={item.courseCanvasId} className={DESCRIPTION} />
        </>
      )}
    </DetailShell>
  );
}

type Stats = NonNullable<NonNullable<FunctionReturnType<typeof api.inbox.gradeDetail>>["scoreStatistics"]>;

/** The score, a bar against the points possible, and the class spread when Canvas shares it. */
function ScoreCard({
  score,
  points,
  grade,
  stats,
}: {
  score: number | undefined;
  points: number | undefined;
  grade: string | undefined;
  stats: Stats | undefined;
}) {
  const scored = score !== undefined && points !== undefined;
  const pct = scored ? percent(score, points) : undefined;
  const fraction = scored && points > 0 ? score / points : undefined;
  const median = stats?.median;

  return (
    <section aria-label="Score" className="rounded-xl border border-line px-5 pt-4 pb-5">
      <div className="text-[12.5px] font-medium text-ink-3">Your score</div>
      <div className="tabular mt-[6px] flex items-baseline gap-3">
        {scored ? (
          <>
            <span className="text-[30px] leading-none font-semibold tracking-[-0.025em] text-ink">
              {formatPoints(score)}
              <span className="font-normal text-ink-3">/{formatPoints(points)}</span>
            </span>
            {pct !== undefined && <span className="text-[15px] font-medium text-ink-2">{pct}</span>}
          </>
        ) : (
          <span className="text-[30px] leading-none font-semibold tracking-[-0.025em] text-ink">
            {grade ?? "—"}
          </span>
        )}
      </div>

      {fraction !== undefined && (
        <div className="relative mt-4">
          <Meter fraction={fraction} />
          {median !== undefined && points !== undefined && points > 0 && (
            <span
              aria-hidden
              title={`Class median ${formatPoints(median)}`}
              className="absolute -top-[3px] h-3 w-[2px] -translate-x-1/2 rounded-full bg-ink"
              style={{ left: `${Math.max(0, Math.min(1, median / points)) * 100}%` }}
            />
          )}
        </div>
      )}

      {stats !== undefined && (
        <dl className="tabular mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 @md:grid-cols-4">
          {median !== undefined && <Stat label="Class median">{formatPoints(median)}</Stat>}
          <Stat label="Mean">{formatPoints(stats.mean)}</Stat>
          <Stat label="High">{formatPoints(stats.max)}</Stat>
          <Stat label="Low">{formatPoints(stats.min)}</Stat>
        </dl>
      )}
    </section>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="mt-[2px] text-[14px] font-medium text-ink">{children}</dd>
    </div>
  );
}

/** One line of the property sheet: a quiet label column beside its value. */
function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-baseline gap-x-4 py-[10px] @md:grid-cols-[128px_minmax(0,1fr)]">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="min-w-0 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <span className="text-ink-3">{children}</span>;
}
