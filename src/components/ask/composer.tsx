import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useDraft, useKeptDraft } from "@/lib/drafts";
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
  const [draft, setDraft] = useKeptDraft("chat:text");
  const [sending, setSending] = useDraft("chat:sending", false);
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
        "cursor-text rounded-[14px] border border-line-2 bg-surface transition-[border-color,box-shadow] focus-within:border-ink-3/50",
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
        className="block max-h-[220px] min-h-[48px] w-full resize-none bg-transparent px-[14px] pt-3 pb-1 text-[16px] leading-[1.5] outline-none placeholder:text-ink-3 md:text-[14.5px]"
      />
      <div className="flex items-center gap-[6px] pt-1 pr-2 pb-2 pl-[10px]">
        <CourseChip value={courseCanvasId} onChange={onCourseChange} />
        {draft.length > MAX_PROMPT_CHARS - 400 && (
          <span className={cn("text-[12px] tabular text-ink-3", tooLong && "text-red")}>
            {draft.length.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()}
          </span>
        )}
        {running && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            title="Stop"
            className="ml-auto grid size-8 place-items-center rounded-[10px] bg-today text-today-fg transition-opacity hover:opacity-90"
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
              "ml-auto grid size-8 place-items-center rounded-[10px] transition-colors",
              canSend ? "bg-today text-today-fg hover:opacity-90" : "bg-chip text-ink-3",
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
          className="inline-flex h-7 max-w-[220px] items-center gap-[6px] rounded-lg px-[8px] text-[12.5px] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 data-[state=open]:bg-hover data-[state=open]:text-ink"
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
