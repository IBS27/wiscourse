// What the Week and Day views show below the Due band when nothing in view
// takes up time: one calm, centred note with the two ways to fill it, in
// place of a column of empty hours.

import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptySchedule({
  title,
  onAddClassTimes,
  onNewEvent,
}: {
  title: string;
  /** Set when no class times exist yet. */
  onAddClassTimes?: () => void;
  onNewEvent: () => void;
}) {
  const classTimes = onAddClassTimes !== undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10 text-center md:px-6">
      <span className="mb-4 grid size-10 place-items-center rounded-xl border border-line bg-sunken text-ink-3">
        <CalendarDays className="size-[19px]" />
      </span>
      <p className="text-[15px] leading-[1.35] font-semibold tracking-[-0.01em] text-ink">{title}</p>
      <p className="mt-1 max-w-[320px] text-xs text-balance text-ink-3">
        {classTimes
          ? "Add your class times or an event and they'll show here."
          : "Add an event and it'll show here."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {classTimes && (
          <Button
            size="sm"
            variant="outline"
            onClick={onAddClassTimes}
            className="rounded-lg border-line-2 text-[12.5px]"
          >
            <Plus className="size-[14px]" />
            Add class times
          </Button>
        )}
        <Button
          size="sm"
          variant={classTimes ? "ghost" : "outline"}
          onClick={onNewEvent}
          className="rounded-lg border-line-2 text-[12.5px]"
        >
          <Plus className="size-[14px]" />
          New event
        </Button>
      </div>
    </div>
  );
}
