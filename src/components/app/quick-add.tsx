import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useMutation } from "convex/react";
import { CalendarDays, Clock, Plus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Chip, Dot } from "./bits";
import { QuickAddContext } from "@/lib/quick-add-context";
import { parseQuickAdd, type QuickAddResult } from "@/lib/quickAdd";
import { formatDay, formatTime, dayKeyOf } from "@/lib/dates";
import { courseLabel, courseStyle, courseColorVar, useCourses, useToday } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ctx = useMemo(() => ({ open: () => setOpen(true) }), []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <QuickAddContext.Provider value={ctx}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="sr-only">Add a task</DialogTitle>
          <DialogDescription className="sr-only">
            Type a task. Add a day like “fri”, a course like “#cs537”, or “due mon 5pm”.
          </DialogDescription>
          {open && <QuickAddForm onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </QuickAddContext.Provider>
  );
}

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const { courses } = useCourses();
  const today = useToday();
  const createLocal = useMutation(api.todos.createLocal);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(
    () =>
      parseQuickAdd(
        value,
        courses.map((c) => ({
          canvasId: c.canvasId,
          courseCode: c.courseCode,
          name: c.name,
          nickname: c.nickname,
        })),
        today,
      ),
    [value, courses, today],
  );

  const submit = useCallback(
    async (keepOpen: boolean) => {
      if (parsed.title.trim().length === 0 || busy) return;
      setBusy(true);
      try {
        await createLocal({
          title: parsed.title,
          plannedDay: parsed.plannedDay,
          dueAt: parsed.dueAt,
          courseCanvasId: parsed.course?.canvasId,
        });
        setValue("");
        if (!keepOpen) onDone();
        else inputRef.current?.focus();
      } finally {
        setBusy(false);
      }
    },
    [parsed, busy, createLocal, onDone],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit(e.altKey);
    }
  };

  return (
    <div>
      <div className="p-4">
        <div className="relative flex h-[38px] items-center gap-[9px] rounded-lg border border-line-2 bg-sunken px-[11px] text-[14px]">
          <Plus className="size-[14px] shrink-0 text-ink-3" />
          <div className="relative min-w-0 flex-1">
            {/* Highlight layer sits under a transparent-text input so tokens underline in place. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-ink">
              <Highlighted parsed={parsed} raw={value} />
            </div>
            <input
              ref={inputRef}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="read ch 4 fri #cs537"
              spellCheck={false}
              autoComplete="off"
              className="relative w-full bg-transparent text-transparent caret-ink outline-none placeholder:text-ink-3"
            />
          </div>
        </div>
        <Preview parsed={parsed} />
      </div>
      <div className="flex flex-wrap gap-[14px] border-t border-line px-4 py-3 text-xs text-ink-3">
        <span><b className="font-semibold text-ink-2">↵</b> add</span>
        <span><b className="font-semibold text-ink-2">⌥↵</b> add and keep open</span>
        <span><b className="font-semibold text-ink-2">esc</b> cancel</span>
      </div>
    </div>
  );
}

/** Re-renders the raw input with parsed tokens underlined in their colour. */
function Highlighted({ parsed, raw }: { parsed: QuickAddResult; raw: string }) {
  const { color } = useCourses();
  // Walk the raw string so whitespace is preserved exactly as typed.
  const out: ReactNode[] = [];
  let cursor = 0;
  parsed.tokens.forEach((tok, i) => {
    const idx = raw.indexOf(tok.text, cursor);
    if (idx < 0) return;
    if (idx > cursor) out.push(<span key={`s${i}`}>{raw.slice(cursor, idx)}</span>);
    if (tok.kind === "text") {
      out.push(<span key={i}>{tok.text}</span>);
    } else {
      const c = tok.kind === "course" ? color(tok.course.canvasId) : courseColorVar(undefined);
      out.push(
        <span key={i} className="border-b-[1.5px] border-c pb-px" style={courseStyle(c)}>
          {tok.text}
        </span>,
      );
    }
    cursor = idx + tok.text.length;
  });
  if (cursor < raw.length) out.push(<span key="tail">{raw.slice(cursor)}</span>);
  return <>{out}</>;
}

function Preview({ parsed }: { parsed: QuickAddResult }) {
  const { color } = useCourses();
  if (parsed.title.trim().length === 0 && parsed.tokens.length === 0) {
    return (
      <div className="pt-3 text-xs text-ink-3">
        Try <span className="text-ink-2">“read ch 4 fri #cs537”</span> or{" "}
        <span className="text-ink-2">“problem set due mon 5pm #math340”</span>.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-[7px] pt-3">
      <Chip solid className={cn(parsed.title.length === 0 && "opacity-50")}>
        {parsed.title.length === 0 ? "Untitled" : parsed.title}
      </Chip>
      {parsed.course && (
        <Chip>
          <Dot style={courseStyle(color(parsed.course.canvasId))} />
          {courseLabel(parsed.course)}
        </Chip>
      )}
      {parsed.plannedDay && (
        <Chip>
          <CalendarDays />
          Planned {formatDay(parsed.plannedDay)}
        </Chip>
      )}
      {parsed.dueAt !== undefined && (
        <Chip>
          <Clock />
          Due {formatDay(dayKeyOf(parsed.dueAt))}, {formatTime(parsed.dueAt)}
        </Chip>
      )}
      <Chip>Personal task</Chip>
    </div>
  );
}
