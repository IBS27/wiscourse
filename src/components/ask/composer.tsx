import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Check, ChevronDown, Square } from "lucide-react";
import { MAX_PROMPT_CHARS } from "../../../convex/lib/assistant";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dot } from "@/components/app/bits";
import { courseLabel, courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const MAX_HEIGHT = 220;

export function Composer({
  onSend,
  onStop,
  running = false,
  courseCanvasId,
  onCourseChange,
  placeholder = "Ask about your courses or plan your week",
  autoFocus = false,
  className,
}: {
  /** Resolves when the message is accepted; rejects to keep the draft. */
  onSend: (prompt: string) => Promise<void>;
  onStop?: () => void;
  running?: boolean;
  courseCanvasId: number | undefined;
  onCourseChange: (courseCanvasId: number | undefined) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to a cap; then the field scrolls.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [draft]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const text = draft.trim();
  const tooLong = draft.length > MAX_PROMPT_CHARS;
  const canSend = text !== "" && !tooLong && !sending && !running;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(text);
      setDraft("");
    } catch {
      // The caller shows the error; the draft stays for another try.
    } finally {
      setSending(false);
      ref.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-line-2 bg-surface focus-within:border-ink-3/60",
        className,
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.focus();
      }}
    >
      <textarea
        ref={ref}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={placeholder}
        aria-label="Message"
        className="block max-h-[220px] min-h-[44px] w-full resize-none bg-transparent px-3 pt-[11px] pb-1 text-[14px] leading-[1.5] outline-none placeholder:text-ink-3"
      />
      <div className="flex items-center gap-[6px] py-[6px] pr-[6px] pl-2">
        <CourseChip value={courseCanvasId} onChange={onCourseChange} />
        {draft.length > MAX_PROMPT_CHARS - 400 && (
          <span className={cn("text-[11.5px] tabular text-ink-3", tooLong && "text-red")}>
            {draft.length.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()}
          </span>
        )}
        {running && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            title="Stop"
            className="ml-auto grid size-7 place-items-center rounded-lg bg-today text-today-fg"
          >
            <Square className="size-[10px] fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            aria-label="Send"
            title="Send"
            className={cn(
              "ml-auto grid size-7 place-items-center rounded-lg",
              canSend ? "bg-today text-today-fg" : "bg-chip text-ink-3",
            )}
          >
            <ArrowUp className="size-[15px] stroke-[2.2]" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Scopes the chat to one course, or none. */
function CourseChip({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (courseCanvasId: number | undefined) => void;
}) {
  const { filterable, byId, color } = useCourses();
  const selected = value === undefined ? undefined : byId.get(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 max-w-[220px] items-center gap-[6px] rounded-md bg-chip px-[7px] text-[12px] text-ink-2 outline-none hover:text-ink data-[state=open]:text-ink"
          style={courseStyle(color(value))}
        >
          {selected ? <Dot /> : null}
          <span className="truncate">{selected ? courseLabel(selected) : "All courses"}</span>
          <ChevronDown className="size-3 shrink-0 text-ink-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(undefined)}>
          <span className="flex-1">All courses</span>
          {value === undefined && <Check />}
        </DropdownMenuItem>
        {filterable.length > 0 && <DropdownMenuSeparator />}
        {filterable.map((course) => (
          <DropdownMenuItem
            key={course.canvasId}
            onSelect={() => onChange(course.canvasId)}
            style={courseStyle(color(course.canvasId))}
          >
            <Dot />
            <span className="flex-1 truncate">{courseLabel(course)}</span>
            {value === course.canvasId && <Check />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
