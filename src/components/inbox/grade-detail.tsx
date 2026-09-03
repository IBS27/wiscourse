import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import { Button } from "@/components/ui/button";
import { todoHref } from "@/lib/course-routes";
import { BlockLabel, CanvasButton, DetailShell, Fact, Facts, Initials, MarkUnreadButton } from "./detail-shell";
import { percent, scoreOf, shortDateTime } from "./format";
import { formatMonthDay } from "@/lib/dates";

// Every number here is gated on `postedAt` by `inbox.gradeDetail`.
export function GradeDetail({
  item,
  onMarkUnread,
}: {
  item: FeedItem;
  onMarkUnread: () => void;
}) {
  const detail = useQuery(api.inbox.gradeDetail, { assignmentCanvasId: item.canvasId });
  const score = detail?.score ?? item.score;
  const points = detail?.pointsPossible ?? item.pointsPossible;
  const pct = score !== undefined && points !== undefined ? percent(score, points) : undefined;
  const median = detail?.scoreStatistics?.median;
  const group = detail?.group;
  const courseScore = detail?.course.currentScore;
  const grader = detail?.comments[0]?.authorName;
  const postedAt = detail?.postedAt ?? item.at;

  return (
    <DetailShell
      item={item}
      eyebrow={`Grade posted · ${item.title}`}
      title={
        <>
          {item.title} graded
          {score !== undefined && points !== undefined && (
            <>
              {" — "}
              <span className="tabular">{scoreOf(score, points)}</span>
            </>
          )}
        </>
      }
      by={
        <>
          {grader !== undefined && <Initials name={grader} />}
          <span>
            {grader !== undefined && `${grader} · `}
            posted {shortDateTime(postedAt)}
          </span>
        </>
      }
      actions={
        <>
          <Button asChild size="sm">
            <Link to={todoHref("assignment", item.canvasId)}>Open assignment</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/grades">Grades</Link>
          </Button>
          <CanvasButton href={detail?.htmlUrl ?? item.htmlUrl}>Submission in Canvas</CanvasButton>
          <MarkUnreadButton onClick={onMarkUnread} disabled={!item.seen} />
        </>
      }
    >
      <Facts>
        <Fact label="Score">
          {score !== undefined && points !== undefined
            ? `${scoreOf(score, points)}${pct === undefined ? "" : ` · ${pct}`}`
            : (item.grade ?? "—")}
        </Fact>
        {median !== undefined && points !== undefined && (
          <Fact label="Class median">{scoreOf(median, points)}</Fact>
        )}
        {group?.weight !== undefined && (
          <Fact label="Weight">{`${Number(group.weight.toFixed(2))}% of ${group.name}`}</Fact>
        )}
        {courseScore !== undefined && (
          <Fact label="Course now">
            {`${Number(courseScore.toFixed(1))}%`}
            {detail?.course.currentGrade !== undefined && ` · ${detail.course.currentGrade}`}
          </Fact>
        )}
      </Facts>

      {detail !== undefined && detail !== null && detail.comments.length > 0 && (
        <>
          <BlockLabel>Grader comments</BlockLabel>
          {detail.comments.map((c, i) => (
            <div
              key={`${c.createdAt}-${i}`}
              className="mt-[10px] border-l-2 border-line-2 py-[2px] pl-3 text-[13px] leading-[1.55]"
            >
              <div className="mb-[2px] text-[12px] text-ink-3">
                {c.authorName} · {formatMonthDay(c.createdAt)}
              </div>
              {c.comment}
            </div>
          ))}
        </>
      )}
    </DetailShell>
  );
}
