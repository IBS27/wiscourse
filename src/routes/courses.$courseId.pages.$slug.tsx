import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { CanvasHtml, type Heading } from "@/components/reader/canvas-html";
import { PageOutline } from "@/components/course/page-outline";
import {
  PageModuleBar,
  PagePrevNext,
} from "@/components/course/page-module-bar";
import {
  findPageModule,
  weekNumberInName,
  type ModuleItemDoc,
  type PageModuleContext,
} from "@/components/course/module-utils";
import { formatMonthDayYear } from "@/lib/dates";
import { courseColorVar, courseStyle, useCourses } from "@/lib/hooks";
import { useMarkSeenOnMount, useSeen } from "@/lib/seen";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/courses/$courseId/pages/$slug")({
  component: CoursePage,
});

type Page = NonNullable<ReturnType<typeof useQuery<typeof api.pages.get>>>;

const COLUMN =
  "min-w-0 max-w-[760px] flex-1 px-4 pt-6 pb-10 md:px-11 md:pt-[26px]";

/**
 * The page reader (design 3-A): a reading column, the module the page sits
 * in, and an outline of the page itself.
 */
function CoursePage() {
  const { courseId, slug } = Route.useParams();
  const canvasId = Number(courseId);
  const valid = Number.isFinite(canvasId);
  const page = useQuery(
    api.pages.get,
    valid ? { courseCanvasId: canvasId, url: slug } : "skip",
  );
  const modules = useQuery(
    api.modules.listByCourse,
    valid ? { courseCanvasId: canvasId } : "skip",
  );
  const { byId, label } = useCourses();
  const seen = useSeen("moduleItem");

  const context = findPageModule(modules, slug);
  // Reading the page is what marks it — both as a page and as the module
  // step it stands for, so the Modules tab loses its dot too.
  useMarkSeenOnMount("page", page?.canvasId);
  useMarkSeenOnMount("moduleItem", context?.item.canvasId);
  const openItem = (item: ModuleItemDoc) => seen.mark(item.canvasId);

  if (page === null) return <NotFound courseId={courseId} />;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={courseStyle(courseColorVar(byId.get(canvasId)?.color))}
    >
      {context !== undefined && (
        <PageModuleBar
          context={context}
          courseId={courseId}
          onOpenItem={openItem}
        />
      )}
      <div className="flex min-h-0 flex-1">
        {page === undefined ? (
          <PageSkeleton />
        ) : (
          // Keyed on the slug so the outline never survives into the next page.
          <PageBody
            key={slug}
            page={page}
            courseId={courseId}
            courseLabel={label(canvasId) ?? "Course"}
            canvasId={canvasId}
            context={context}
            onOpenItem={openItem}
          />
        )}
      </div>
    </div>
  );
}

function PageBody({
  page,
  courseId,
  courseLabel,
  canvasId,
  context,
  onOpenItem,
}: {
  page: Page;
  courseId: string;
  courseLabel: string;
  canvasId: number;
  context: PageModuleContext | undefined;
  onOpenItem: (item: ModuleItemDoc) => void;
}) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const modules = "/courses/$courseId/modules" as const;
  const crumbs = [
    { to: "/courses/$courseId" as const, hash: undefined, text: courseLabel },
    { to: modules, hash: undefined, text: "Modules" },
    ...(context === undefined
      ? []
      : [
          {
            to: modules,
            hash: `module-${context.module.canvasId}`,
            text: shortModuleName(context.module.name),
          },
        ]),
  ];

  return (
    <>
      <article className={COLUMN}>
        <nav className="flex items-center gap-[6px] text-xs text-ink-3">
          {crumbs.map((crumb, i) => (
            <span
              key={crumb.text}
              className="flex min-w-0 items-center gap-[6px]"
            >
              {i > 0 && <span aria-hidden>/</span>}
              <Link
                to={crumb.to}
                params={{ courseId }}
                hash={crumb.hash}
                className={
                  i === 0
                    ? "font-medium text-c hover:underline"
                    : "truncate hover:text-ink-2"
                }
              >
                {crumb.text}
              </Link>
            </span>
          ))}
        </nav>

        <h1 className="mt-[10px] mb-1 text-[22px] leading-[1.25] font-semibold tracking-[-0.02em]">
          {page.title}
        </h1>
        {page.updatedAt !== undefined && (
          <div className="mb-[22px] text-xs text-ink-3">
            Updated {formatMonthDayYear(page.updatedAt)}
          </div>
        )}

        {page.lockedForUser === true && (
          <div className="mb-5 flex items-center gap-[9px] rounded-lg border border-line bg-sunken px-3 py-[10px] text-[12.5px] text-ink-2">
            <Lock className="size-[14px] shrink-0 text-ink-3" />
            Locked in Canvas
          </div>
        )}

        {page.contentUnavailable || page.body === undefined ? (
          <p className="text-[13px] text-ink-3">
            Content is unavailable in wiscourse.{" "}
            <a
              href={page.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Open in Canvas
            </a>
          </p>
        ) : page.body.trim() === "" ? (
          <p className="text-[13px] text-ink-3">
            This page has no content yet.
          </p>
        ) : (
          <CanvasHtml
            html={page.body}
            courseId={canvasId}
            onOutline={setHeadings}
          />
        )}

        {context !== undefined && (
          <PagePrevNext
            context={context}
            courseId={courseId}
            onOpenItem={onOpenItem}
          />
        )}
      </article>

      <PageOutline headings={headings} />
    </>
  );
}

/** "Week 4 — Threads & Concurrency" reads as "Week 4" in a breadcrumb. */
function shortModuleName(name: string): string {
  const week = weekNumberInName(name);
  return week === undefined ? name : `Week ${week}`;
}

function NotFound({ courseId }: { courseId: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <p className="text-[13px] text-ink-3">
        That page isn’t in this course, or hasn’t synced yet.
      </p>
      <Link
        to="/courses/$courseId/modules"
        params={{ courseId }}
        className="inline-flex h-[31px] items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:bg-hover"
      >
        Back to modules
      </Link>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className={cn(COLUMN, "animate-pulse")}>
      <div className="h-[22px] w-[70%] rounded bg-chip" />
      <div className="mt-3 h-[13px] w-28 rounded bg-chip" />
      <div className="mt-7 space-y-[10px]">
        {[96, 88, 92, 60, 84, 74].map((width) => (
          <div
            key={width}
            className="h-[13px] rounded bg-chip"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
    </div>
  );
}
