// Canvas has no meeting times, so the student enters them once per course
// and every view — week grid, month, day, the ICS feed — gets its lectures.
// The syllabus line ("MWF 9:55-10:45 · CS 1240") is shown as a hint and, when
// it parses cleanly, prefills the first meeting.

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { MEETING_KIND_LABELS, type MeetingKind } from "../../../convex/lib/meetings";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dayLetters,
  minuteFromTimeInput,
  minuteRange,
  parseMeetsHint,
  timeInputValue,
} from "@/lib/calendar";
import { courseLabel, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type MeetingDoc = Doc<"courseMeetings">;

// Taken from the labels rather than convex/schema.ts: the schema module
// pulls `convex/server` in, which has no business in the browser bundle.
const MEETING_KINDS = Object.keys(MEETING_KIND_LABELS) as MeetingKind[];

const FIELD =
  "h-9 rounded-md border border-line bg-surface px-2 text-[13px] text-ink outline-none focus-visible:border-line-2";

/** Monday first, the way a timetable reads; values are 0 = Sunday. */
const WEEK: { day: number; label: string }[] = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];

export function MeetingsEditor({
  open,
  onOpenChange,
  courseCanvasId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed when opened from a course; otherwise the dialog asks which one. */
  courseCanvasId?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        {open && <Editor courseCanvasId={courseCanvasId} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Editor({
  courseCanvasId,
  onClose,
}: {
  courseCanvasId?: number;
  onClose: () => void;
}) {
  const { filterable, byId } = useCourses();
  // Derived, not seeded: the dialog can open before `courses.list` answers.
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const canvasId = chosen ?? courseCanvasId ?? filterable[0]?.canvasId;
  const meetings = useQuery(
    api.meetings.forCourse,
    canvasId === undefined ? "skip" : { courseCanvasId: canvasId },
  );
  const facts = useQuery(api.courses.facts, canvasId === undefined ? "skip" : { canvasId });
  const remove = useMutation(api.meetings.remove);
  const [editing, setEditing] = useState<MeetingDoc | "new" | null>(null);

  const hint = useMemo(() => {
    const parts = [facts?.meets, facts?.location].filter((p) => p !== undefined);
    return parts.length === 0 ? undefined : parts.join(" · ");
  }, [facts]);
  const prefill = useMemo(() => parseMeetsHint(facts?.meets), [facts]);
  const course = canvasId === undefined ? undefined : byId.get(canvasId);

  return (
    <div>
      <div className="border-b border-line px-4 pt-4 pb-[14px]">
        <DialogTitle className="text-[14px] font-semibold tracking-[-0.01em]">
          Class times
        </DialogTitle>
        <DialogDescription className="mt-[3px] text-[12.5px] text-ink-3">
          {course === undefined
            ? "When your classes meet. Canvas does not carry meeting times, so they live here."
            : `When ${courseLabel(course)} meets. These show on the calendar and in your subscribed feed.`}
        </DialogDescription>
      </div>

      <div className="max-h-[62vh] overflow-y-auto">
        {courseCanvasId === undefined && (
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="text-[12.5px] text-ink-3">Course</span>
            <select
              value={canvasId === undefined ? "" : String(canvasId)}
              disabled={filterable.length === 0}
              onChange={(e) => {
                setChosen(Number(e.target.value));
                setEditing(null);
              }}
              aria-label="Course"
              className={cn(FIELD, "min-w-[220px]")}
            >
              {filterable.map((c) => (
                <option key={c.canvasId} value={String(c.canvasId)}>
                  {courseLabel(c)}
                </option>
              ))}
            </select>
          </div>
        )}

        {hint !== undefined && (
          <div className="border-b border-line bg-sunken px-4 py-[10px] text-[12.5px] text-ink-3">
            Syllabus says: <span className="text-ink-2">{hint}</span>
          </div>
        )}

        {meetings?.length === 0 && editing === null && (
          <div className="px-4 pt-4 text-[12.5px] text-ink-3">
            No class times yet.
          </div>
        )}

        {canvasId !== undefined &&
          (meetings ?? []).map((meeting) =>
          editing !== null && editing !== "new" && editing._id === meeting._id ? (
            <MeetingForm
              key={meeting._id}
              courseCanvasId={canvasId}
              meeting={meeting}
              onDone={() => setEditing(null)}
            />
          ) : (
            <div
              key={meeting._id}
              className="flex items-center gap-3 border-b border-line px-4 py-3 text-[13px]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {meeting.label ?? MEETING_KIND_LABELS[meeting.kind]}
                </div>
                <div className="mt-[2px] truncate text-[12px] tabular text-ink-3">
                  {dayLetters(meeting.days)} · {minuteRange(meeting.startMinute, meeting.endMinute)}
                  {meeting.location !== undefined && ` · ${meeting.location}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit class time"
                onClick={() => setEditing(meeting)}
              >
                <Pencil className="size-[14px]" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete class time"
                onClick={() => void remove({ id: meeting._id })}
                className="text-ink-3 hover:text-red"
              >
                <Trash2 className="size-[14px]" />
              </Button>
            </div>
          ),
          )}

        {editing === "new" && canvasId !== undefined && (
          <MeetingForm
            courseCanvasId={canvasId}
            prefill={meetings?.length === 0 ? prefill : undefined}
            defaultLocation={meetings?.length === 0 ? facts?.location : undefined}
            onDone={() => setEditing(null)}
          />
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        {editing !== "new" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing("new")}
            disabled={canvasId === undefined}
          >
            <Plus className="size-[14px]" />
            Add class time
          </Button>
        )}
        <Button size="sm" onClick={onClose} className="ml-auto">
          Done
        </Button>
      </div>
    </div>
  );
}

function MeetingForm({
  courseCanvasId,
  meeting,
  prefill,
  defaultLocation,
  onDone,
}: {
  courseCanvasId: number;
  meeting?: MeetingDoc;
  prefill?: { days: number[]; startMinute: number; endMinute: number };
  defaultLocation?: string;
  onDone: () => void;
}) {
  const create = useMutation(api.meetings.create);
  const update = useMutation(api.meetings.update);
  const [kind, setKind] = useState<MeetingKind>(meeting?.kind ?? "lecture");
  const [label, setLabel] = useState(meeting?.label ?? "");
  const [days, setDays] = useState<number[]>(meeting?.days ?? prefill?.days ?? []);
  const [start, setStart] = useState(
    timeInputValue(meeting?.startMinute ?? prefill?.startMinute ?? 9 * 60),
  );
  const [end, setEnd] = useState(
    timeInputValue(meeting?.endMinute ?? prefill?.endMinute ?? 9 * 60 + 50),
  );
  const [location, setLocation] = useState(meeting?.location ?? defaultLocation ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (day: number) =>
    setDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const fields = {
      courseCanvasId,
      kind,
      label: label.trim() === "" ? undefined : label.trim(),
      days,
      startMinute: minuteFromTimeInput(start),
      endMinute: minuteFromTimeInput(end),
      location: location.trim() === "" ? undefined : location.trim(),
    };
    try {
      if (meeting === undefined) await create(fields);
      else await update({ id: meeting._id, ...fields });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-b border-line bg-sunken px-4 py-[14px]">
      <div className="flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as MeetingKind)}
          aria-label="Kind"
          className={cn(FIELD, "w-[150px]")}
        >
          {MEETING_KINDS.map((k) => (
            <option key={k} value={k}>
              {MEETING_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Section 302 (optional)"
          aria-label="Label"
          className="w-[220px] bg-surface"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {WEEK.map(({ day, label: name }) => (
          <button
            key={day}
            type="button"
            aria-pressed={days.includes(day)}
            onClick={() => toggle(day)}
            className={cn(
              "h-8 w-[46px] rounded-md border border-line bg-surface text-[12.5px] font-medium text-ink-2 hover:border-line-2",
              days.includes(day) && "border-transparent bg-today text-today-fg",
            )}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          aria-label="Start time"
          className={cn(FIELD, "w-[120px] tabular")}
        />
        <span className="text-ink-3">–</span>
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          aria-label="End time"
          className={cn(FIELD, "w-[120px] tabular")}
        />
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location"
          aria-label="Location"
          className="w-[200px] bg-surface"
        />
      </div>

      {error !== null && <p className="text-[12.5px] text-red">{error}</p>}

      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-3">Repeats weekly for the term</span>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy || days.length === 0}>
            {meeting === undefined ? "Add" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
