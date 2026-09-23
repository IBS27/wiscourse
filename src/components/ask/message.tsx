import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { getToolName, isTextUIPart, isToolUIPart } from "ai";
import { ChevronDown, ChevronRight, Eye, FileText } from "lucide-react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Markdown } from "./markdown";
import { ChangeCard } from "./change-card";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Part = UIMessage["parts"][number];
type ToolPart = Extract<Part, { toolCallId: string }>;

interface Source {
  title: string;
  href: string;
  courseCanvasId: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function sourceOf(part: ToolPart): Source | undefined {
  const source = record(record(part.output)?.source);
  if (typeof source?.title !== "string" || typeof source.href !== "string" || typeof source.courseCanvasId !== "number") {
    return undefined;
  }
  return { title: source.title, href: source.href, courseCanvasId: source.courseCanvasId };
}

const PART_LABEL: Record<string, string> = {
  overview: "overview",
  assignments: "assignments",
  announcements: "announcements",
  modules: "modules",
  pages: "pages",
  files: "files",
};

/** One line per lookup, in past tense once it has a result. */
function describeCall(part: ToolPart, label: (id: number | undefined) => string | undefined): string {
  const input = record(part.input) ?? {};
  const done = part.state === "output-available" || part.state === "output-error";
  const course = typeof input.courseId === "number" ? label(input.courseId) : undefined;
  switch (getToolName(part)) {
    case "agenda":
      return done ? "Checked your schedule" : "Checking your schedule";
    case "tasks":
      return done ? "Checked your tasks" : "Checking your tasks";
    case "course": {
      const what = `${course ?? "the course"} ${PART_LABEL[String(input.part)] ?? ""}`.trim();
      return done ? `Looked at ${what}` : `Looking at ${what}`;
    }
    case "read": {
      const title = sourceOf(part)?.title;
      const what = title ? `“${title}”` : input.kind === "syllabus" ? `the ${course ?? ""} syllabus`.replace("  ", " ") : `a ${String(input.kind ?? "page")}`;
      return done ? `Read ${what}` : `Reading ${what}`;
    }
    case "grades":
      return done ? `Checked ${course ? `${course} ` : ""}grades` : `Checking ${course ? `${course} ` : ""}grades`;
    case "search":
      return done ? `Searched for “${String(input.query ?? "")}”` : `Searching for “${String(input.query ?? "")}”`;
    default:
      return done ? "Looked something up" : "Looking something up";
  }
}

function summarize(calls: ToolPart[]): string {
  const reads = calls.filter((c) => getToolName(c) === "read").length;
  const other = calls.length - reads;
  if (calls.length === 1) return "";
  if (other === 0) return `Read ${reads} items`;
  return `Looked up ${calls.length} things`;
}

function Activity({ calls }: { calls: ToolPart[] }) {
  const [open, setOpen] = useState(false);
  const { label } = useCourses();
  const running = calls.some((c) => c.state === "input-streaming" || c.state === "input-available");
  const lines = calls.map((c) => describeCall(c, label));
  const head = running ? lines[lines.findIndex((_, i) => calls[i].state !== "output-available")] ?? lines.at(-1) : summarize(calls) || lines[0];
  const expandable = calls.length > 1 && !running;
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => expandable && setOpen(!open)}
        className={cn("flex items-center gap-[7px] text-[12px] text-ink-3", expandable ? "cursor-pointer hover:text-ink-2" : "cursor-default")}
        aria-expanded={expandable ? open : undefined}
      >
        {running ? (
          <span className="size-3 animate-spin rounded-full border-[1.5px] border-line-2 border-t-ink-2 motion-reduce:animate-none" />
        ) : (
          <Eye className="size-[13px]" />
        )}
        <span>{head}</span>
        {expandable && (open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />)}
      </button>
      {open && (
        <ul className="mt-[3px] ml-5 flex flex-col gap-[3px] text-[12px] text-ink-3">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  const navigate = useNavigate();
  const { label, color } = useCourses();
  if (sources.length === 0) return null;
  return (
    <div className="mt-[10px] flex flex-wrap gap-[6px]">
      {sources.map((s) => (
        <a
          key={s.href}
          href={s.href}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            void navigate({ to: s.href });
          }}
          className="inline-flex h-6 max-w-[280px] items-center gap-[6px] rounded-md bg-chip pr-[9px] pl-2 text-[12px] text-ink-2 hover:text-ink"
          style={courseStyle(color(s.courseCanvasId))}
        >
          <FileText className="size-3 shrink-0 text-c" />
          <span className="truncate">{s.title}</span>
          {label(s.courseCanvasId) && <span className="shrink-0 text-ink-3">{label(s.courseCanvasId)}</span>}
        </a>
      ))}
    </div>
  );
}

function StreamingText({ text, streaming }: { text: string; streaming: boolean }) {
  const [visible] = useSmoothText(text, { startStreaming: streaming });
  return <Markdown text={visible} />;
}

export function UserMessage({ message }: { message: UIMessage }) {
  return (
    <div className="ml-auto w-fit max-w-[86%] rounded-[12px_12px_4px_12px] border border-line bg-sunken px-3 pt-2 pb-[9px] text-[14px] leading-[1.5] break-words whitespace-pre-wrap">
      {message.text}
    </div>
  );
}

type Block =
  | { kind: "text"; text: string; key: string }
  | { kind: "activity"; calls: ToolPart[]; key: string }
  | { kind: "change"; changeId?: Id<"assistantChanges">; error?: string; pending: boolean; key: string };

/** Groups parts: runs of lookups become one activity line. */
function blocksOf(parts: Part[]): Block[] {
  const blocks: Block[] = [];
  parts.forEach((part, i) => {
    if (isTextUIPart(part)) {
      if (part.text.trim() === "") return;
      const last = blocks.at(-1);
      if (last?.kind === "text") last.text += part.text;
      else blocks.push({ kind: "text", text: part.text, key: `t${i}` });
      return;
    }
    if (!isToolUIPart(part)) return;
    if (getToolName(part) === "makeChanges") {
      const output = record(part.output);
      blocks.push({
        kind: "change",
        changeId: typeof output?.changeId === "string" ? (output.changeId as Id<"assistantChanges">) : undefined,
        error: typeof output?.error === "string" ? output.error : part.state === "output-error" ? part.errorText : undefined,
        pending: part.state !== "output-available" && part.state !== "output-error",
        key: part.toolCallId,
      });
      return;
    }
    const last = blocks.at(-1);
    if (last?.kind === "activity") last.calls.push(part);
    else blocks.push({ kind: "activity", calls: [part], key: part.toolCallId });
  });
  return blocks;
}

export function AssistantMessage({
  message,
  changes,
}: {
  message: UIMessage;
  changes: Map<string, Doc<"assistantChanges">> | undefined;
}) {
  const streaming = message.status === "streaming";
  const blocks = blocksOf(message.parts);
  const sources = message.parts
    .filter(isToolUIPart)
    .map(sourceOf)
    .filter((s): s is Source => s !== undefined)
    .filter((s, i, all) => all.findIndex((o) => o.href === s.href) === i);
  const lastText = blocks.map((b) => b.kind).lastIndexOf("text");

  return (
    <div className="min-w-0">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "text":
            return i === lastText && streaming ? (
              <StreamingText key={block.key} text={block.text} streaming />
            ) : (
              <Markdown key={block.key} text={block.text} className="mb-2 last:mb-0" />
            );
          case "activity":
            return <Activity key={block.key} calls={block.calls} />;
          case "change":
            if (block.pending) {
              return (
                <div key={block.key} className="mb-2 flex items-center gap-[7px] text-[12px] text-ink-3">
                  <span className="size-3 animate-spin rounded-full border-[1.5px] border-line-2 border-t-ink-2 motion-reduce:animate-none" />
                  Preparing changes
                </div>
              );
            }
            if (block.changeId === undefined) {
              return (
                <div key={block.key} className="mb-2 text-[12px] text-ink-3">
                  Couldn’t make that change{block.error ? `: ${block.error}` : "."}
                </div>
              );
            }
            return <ChangeCard key={block.key} change={changes?.get(block.changeId)} />;
        }
      })}
      {!streaming && <Sources sources={sources} />}
      {message.status === "failed" && blocks.length > 0 && (
        <div className="mt-1 text-[12px] text-ink-3">This reply didn’t finish.</div>
      )}
    </div>
  );
}
