import { useDraft } from "@/lib/drafts";
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  CalendarPlus,
  ChartNoAxesColumn,
  Eye,
  MessageCircle,
  Megaphone,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Composer } from "@/components/ask/composer";
import { AskMobileNav } from "@/components/ask/mobile-nav";
import { CourseTag } from "@/components/app/bits";
import { HEADER_BAR, HeaderTitle } from "@/components/app/page-header";
import { isDone } from "@/lib/agenda";
import { errorMessage } from "@/lib/ask";
import { DAY_MS } from "@/lib/dates";
import { useInboxFeed, useTodoList } from "@/lib/list-queries";
import { courseLabel, courseStyle, useCourses, useNow } from "@/lib/hooks";
import { displayTimeZone } from "@/lib/time-zone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ask/")({
  component: NewChat,
});

interface Suggestion {
  prompt: string;
  icon: LucideIcon;
  course?: number;
  note?: string;
}

/** Starting points drawn from this week, not generic examples. */
function useSuggestions(): Suggestion[] {
  const items = useTodoList();
  const feed = useInboxFeed();
  const now = useNow();
  const { visible } = useCourses();
  const out: Suggestion[] = [];

  const open = (items ?? []).filter((i) => !isDone(i) && i.dueAt !== undefined);
  const week = open.filter((i) => i.dueAt! >= now && i.dueAt! < now + 7 * DAY_MS);
  out.push({ prompt: "What’s due this week?", icon: CalendarClock, note: week.length > 0 ? `${week.length} item${week.length === 1 ? "" : "s"} due` : "Nothing due yet" });

  const announcements = (feed ?? []).filter((f) => f.type === "announcement" && !f.seen);
  if (announcements.length > 0) {
    out.push({ prompt: "Catch up on announcements", icon: Megaphone, note: `${announcements.length} unread` });
  }

  const biggest = open
    .filter((i) => i.dueAt! >= now && i.dueAt! < now + 10 * DAY_MS && i.plannedDay === undefined)
    .sort((a, b) => (b.pointsPossible ?? 0) - (a.pointsPossible ?? 0))[0];
  if (biggest) out.push({ prompt: `Plan time for ${biggest.title}`, icon: CalendarPlus, course: biggest.courseCanvasId });

  // Every card carries a second line so the grid's rows share one rhythm.
  out.push({ prompt: "How are my grades looking?", icon: ChartNoAxesColumn, note: `${visible.length} course${visible.length === 1 ? "" : "s"} this term` });
  if (visible[0]) out.push({ prompt: `Summarize the ${courseLabel(visible[0])} syllabus`, icon: BookOpen, course: visible[0].canvasId });
  return out.slice(0, 4);
}

function NewChat() {
  const send = useMutation(api.assistant.send);
  const navigate = useNavigate();
  const { color, label } = useCourses();
  const suggestions = useSuggestions();
  const [course, setCourse] = useDraft<number | undefined>("chat:course", undefined);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useDraft("chat:starting", false);

  const start = async (prompt: string, courseCanvasId = course) => {
    setError(undefined);
    setBusy(true);
    try {
      const threadId = await send({ prompt, courseCanvasId, timeZone: displayTimeZone() });
      void navigate({ to: "/ask/$threadId", params: { threadId } });
    } catch (caught) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2 md:hidden">
        <AskMobileNav />
        <span className="flex-1 text-center text-[15px] font-semibold tracking-[-0.015em]">Ask</span>
      </header>
      <header className={cn(HEADER_BAR, "hidden items-center md:flex")}>
        <HeaderTitle title="Ask" subtitle="Answers from your synced Canvas courses" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 md:px-6">
        <div className="flex w-full max-w-[640px] flex-1 flex-col pt-8 md:pt-[14vh]">
          <div className="flex flex-col items-start md:items-center md:text-center">
            <span className="mb-4 grid size-10 place-items-center rounded-xl border border-line bg-sunken text-ink-2">
              <MessageCircle className="size-[19px]" />
            </span>
            <h1 className="text-[22px] leading-[1.25] font-semibold tracking-[-0.025em] text-balance">
              Ask about your courses, or tell it what to plan.
            </h1>
          </div>

          <div className="order-last mt-auto pt-6 pb-[max(12px,env(safe-area-inset-bottom))] md:order-none md:mt-8 md:pt-0 md:pb-0">
            <Composer
              onSend={(prompt) => start(prompt)}
              courseCanvasId={course}
              onCourseChange={setCourse}
              autoFocus
              className="shadow-[0_1px_2px_rgba(16,17,20,0.04),0_4px_16px_-6px_rgba(16,17,20,0.08)]"
            />
            {error && (
              <p className="mt-2 text-[12.5px] text-red" role="status">
                {error}
              </p>
            )}
          </div>

          <div className="mt-7 md:mt-6">
            <div className="mb-2 px-[2px] text-[12.5px] font-medium text-ink-3">Suggestions from this week</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {suggestions.map((s) => {
                const code = s.course === undefined ? undefined : label(s.course);
                return (
                  <button
                    key={s.prompt}
                    type="button"
                    disabled={busy}
                    onClick={() => void start(s.prompt, s.course ?? course).catch(() => undefined)}
                    title={s.prompt}
                    // One height for every card, content from the top, so the grid reads as a set.
                    className="group flex min-h-[72px] items-start gap-3 rounded-[10px] border border-line bg-surface px-3 py-[11px] text-left transition-colors hover:border-line-2 hover:bg-hover focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none disabled:opacity-60"
                    style={courseStyle(color(s.course))}
                  >
                    <s.icon className="mt-px size-4 shrink-0 text-ink-3 transition-colors group-hover:text-ink-2" />
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span className="truncate text-[13.5px] leading-[1.35] font-medium text-ink">{s.prompt}</span>
                      {(code !== undefined || s.note) && (
                        <span className="flex min-w-0 items-center gap-2 text-[12px] text-ink-3">
                          {code !== undefined && <CourseTag className="shrink-0">{code}</CourseTag>}
                          {s.note && <span className="truncate tabular">{s.note}</span>}
                        </span>
                      )}
                    </span>
                    <ArrowUpRight className="mt-px size-[14px] shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-[6px] px-[2px] text-[12px] text-ink-3 md:items-center">
            <span className="flex items-center gap-[7px]">
              <Eye className="size-[13px] shrink-0" />
              Reads your Canvas courses, grades and files
            </span>
            <span className="flex items-center gap-[7px]">
              <Pencil className="size-[13px] shrink-0" />
              Changes only your wiscourse tasks, plans and calendar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
