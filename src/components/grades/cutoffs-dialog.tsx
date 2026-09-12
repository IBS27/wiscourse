import { useState } from "react";
import { useMutation } from "convex/react";
import { Plus, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { SchemeEntry } from "../../../convex/lib/grades";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatPoints } from "@/lib/grades-ui";

interface Draft {
  name: string;
  /** Percent as typed: "93", "88.5". */
  percent: string;
}

function toDraft(scheme: SchemeEntry[]): Draft[] {
  return scheme.map((entry) => ({ name: entry.name, percent: formatPoints(entry.value * 100) }));
}

function parse(rows: Draft[]): SchemeEntry[] | undefined {
  const out: SchemeEntry[] = [];
  for (const row of rows) {
    const name = row.name.trim();
    const percent = Number(row.percent.trim());
    if (name === "" || !Number.isFinite(percent) || percent < 0 || percent > 100) return undefined;
    out.push({ name, value: percent / 100 });
  }
  return out.length === 0 ? undefined : out;
}

/**
 * The student's own letter cutoffs for one course. Saving overrides Canvas's
 * scheme; "Use the default" puts it back.
 */
export function CutoffsDialog({
  courseCanvasId,
  scheme,
  open,
  onOpenChange,
}: {
  courseCanvasId: number;
  scheme: SchemeEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so every opening starts from what is in force. */}
      {open && (
        <CutoffsForm courseCanvasId={courseCanvasId} scheme={scheme} onOpenChange={onOpenChange} />
      )}
    </Dialog>
  );
}

function CutoffsForm({
  courseCanvasId,
  scheme,
  onOpenChange,
}: {
  courseCanvasId: number;
  scheme: SchemeEntry[];
  onOpenChange: (open: boolean) => void;
}) {
  const setCutoffs = useMutation(api.grades.setCutoffs);
  const [rows, setRows] = useState<Draft[]>(() => toDraft(scheme));
  const parsed = parse(rows);

  const edit = (index: number, patch: Partial<Draft>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <>
      <DialogContent className="max-w-[420px] p-5">
        <DialogTitle className="text-[15px] font-semibold tracking-[-0.015em]">
          Letter cutoffs
        </DialogTitle>
        <DialogDescription className="mt-1 text-[12.5px] text-ink-3">
          The lowest percentage that earns each letter. Used for "to finish with" only.
        </DialogDescription>

        <div className="mt-4 flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                aria-label="Letter"
                value={row.name}
                onChange={(event) => edit(index, { name: event.target.value })}
                className="h-8 w-20 text-[13px]"
              />
              <span className="text-[13px] text-ink-3">≥</span>
              <Input
                aria-label={`Percent for ${row.name}`}
                inputMode="decimal"
                value={row.percent}
                onChange={(event) => edit(index, { percent: event.target.value })}
                className="tabular h-8 w-24 text-[13px]"
              />
              <span className="text-[13px] text-ink-3">%</span>
              <button
                type="button"
                aria-label={`Remove ${row.name}`}
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                className="ml-auto text-ink-3 hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { name: "", percent: "" }])}
            className="mt-1 inline-flex items-center gap-[6px] self-start text-[12.5px] font-medium text-ink-2"
          >
            <Plus className="size-[14px]" />
            Add a letter
          </button>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button
            size="sm"
            disabled={parsed === undefined}
            onClick={() => {
              if (parsed === undefined) return;
              void setCutoffs({ courseCanvasId, cutoffs: parsed });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void setCutoffs({ courseCanvasId, cutoffs: null });
              onOpenChange(false);
            }}
          >
            Use the default
          </Button>
          <DialogClose asChild>
            <Button size="sm" variant="ghost" className="ml-auto text-ink-3">
              Cancel
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </>
  );
}
