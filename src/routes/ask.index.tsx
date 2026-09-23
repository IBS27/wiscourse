import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Eye, Pencil } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Composer } from "@/components/ask/composer";
import { AskMobileNav } from "@/components/ask/mobile-nav";
import { Dot } from "@/components/app/bits";
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
  out.push({ prompt: "What’s due this week?", note: week.length > 0 ? `${week.length} item${week.length === 1 ? "" : "s"}` : undefined });

  const announcements = (feed ?? []).filter((f) => f.type === "announcement" && !f.seen);
  if (announcements.length > 0) {
    out.push({ prompt: "Catch me up on new announcements", note: `${announcements.length} new` });
  }

  const biggest = open
    .filter((i) => i.dueAt! >= now && i.dueAt! < now + 10 * DAY_MS && i.plannedDay === undefined)
    .sort((a, b) => (b.pointsPossible ?? 0) - (a.pointsPossible ?? 0))[0];
  if (biggest) out.push({ prompt: `Plan time for ${biggest.title}`, course: biggest.courseCanvasId });

  out.push({ prompt: "How are my grades looking?" });
  if (visible[0]) out.push({ prompt: `Summarize the ${courseLabel(visible[0])} syllabus`, course: visible[0].canvasId });
  return out.slice(0, 4);
}

function NewChat() {
  const send = useMutation(api.assistant.send);
  const navigate = useNavigate();
  const { color } = useCourses();
  const suggestions = useSuggestions();
  const [course, setCourse] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

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
      <header className="flex h-[54px] shrink-0 items-center gap-1 border-b border-line px-2 md:hidden">
        <AskMobileNav />
        <span className="flex-1 text-center text-[15px] font-semibold tracking-[-0.015em]">Ask</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 md:px-6">
        <div className="flex w-full max-w-[640px] flex-1 flex-col pt-10 pb-6 md:justify-center md:pt-0">
          <h1 className="text-[20px] leading-[1.25] font-semibold tracking-[-0.025em]">
            Ask about your courses, or tell it what to plan.
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-2">Suggestions from this week:</p>
          <div className="mt-4 overflow-hidden rounded-[10px] border border-line">
            {suggestions.map((s) => (
              <button
                key={s.prompt}
                type="button"
                disabled={busy}
                onClick={() => void start(s.prompt, s.course ?? course).catch(() => undefined)}
                className="flex w-full items-center gap-[10px] border-b border-line px-3 py-[11px] text-left text-[13.5px] last:border-b-0 hover:bg-hover disabled:opacity-60"
                style={courseStyle(color(s.course))}
              >
                <Dot />
                <span className="min-w-0 flex-1 truncate">{s.prompt}</span>
                {s.note && <span className="shrink-0 text-[11.5px] text-ink-3">{s.note}</span>}
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-[7px] text-[12px] text-ink-3">
            <div className="flex items-center gap-2">
              <Eye className="size-[14px]" />
              Reads your Canvas courses, grades and files
            </div>
            <div className="flex items-center gap-2">
              <Pencil className="size-[14px]" />
              Changes only your wiscourse tasks, plans and calendar
            </div>
          </div>
          <div className="mt-6 md:mt-8">
            <Composer onSend={(prompt) => start(prompt)} courseCanvasId={course} onCourseChange={setCourse} autoFocus />
            <p className={cn("mt-2 min-h-[18px] text-[12.5px]", error ? "text-red" : "text-transparent")} role="status">
              {error ?? " "}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
