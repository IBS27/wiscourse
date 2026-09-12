// The subscribe sheet: a private ICS feed for Apple Calendar, Google
// Calendar or Outlook, plus the display time zone. Shown in a dialog from
// the calendar and inline in Settings — one component, two frames.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Clock, Copy, Globe, Info, RefreshCw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mark, type MarkKind } from "./marks";
import { formatSince } from "@/lib/dates";
import {
  browserTimeZone,
  setDisplayTimeZone,
  TIME_ZONE_CHOICES,
  useDisplayTimeZone,
} from "@/lib/time-zone";
import { cn } from "@/lib/utils";

type Include = { meetings: boolean; due: boolean; planned: boolean; events: boolean };

const INCLUDE_ROWS: { id: keyof Include; label: string; mark: MarkKind }[] = [
  { id: "meetings", label: "Class meetings", mark: "meeting" },
  { id: "due", label: "Due dates", mark: "due" },
  { id: "planned", label: "Planned todos", mark: "planned" },
  { id: "events", label: "Events", mark: "event" },
];

export function SubscribeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <div className="border-b border-line px-[18px] pt-4 pb-[14px]">
          <DialogTitle className="text-[14px] font-semibold tracking-[-0.01em]">
            Subscribe in another calendar
          </DialogTitle>
          <DialogDescription className="mt-[3px] text-[12.5px] leading-[1.5] text-ink-3">
            A private feed for Apple Calendar, Google Calendar or Outlook. It refreshes on their
            schedule, usually every few hours.
          </DialogDescription>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          <SubscribeSections />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The blocks themselves, so Settings can drop them into its own card. */
export function SubscribeSections() {
  const prefs = useQuery(api.prefs.get);
  const setInclude = useMutation(api.prefs.setIcsInclude);
  const regenerate = useMutation(api.prefs.regenerateIcs);
  const disable = useMutation(api.prefs.disableIcs);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const secret = prefs?.icsSecret;
  const include = prefs?.icsInclude ?? { meetings: true, due: true, planned: true, events: true };
  // Without the Convex site origin the link would read "undefined/ics/…",
  // which a student would dutifully paste into Apple Calendar.
  const site = import.meta.env.VITE_CONVEX_SITE_URL;
  const configured = typeof site === "string" && site !== "";
  const url = secret === undefined || !configured ? undefined : `${site}/ics/${secret}.ics`;

  const copy = async () => {
    if (url === undefined) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const create = async () => {
    setBusy(true);
    try {
      await regenerate();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="border-b border-line px-[18px] py-[14px]">
        <div className="eyebrow mb-[10px]">Feed link</div>
        {!configured ? (
          <div className="text-[12.5px] text-ink-3">
            Feed URL is not configured, so no link can be made here.
          </div>
        ) : url === undefined ? (
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => void create()} disabled={busy || prefs === undefined}>
              Create feed link
            </Button>
            <span className="text-[12px] text-ink-3">No feed exists yet.</span>
          </div>
        ) : (
          <div className="flex h-[34px] items-center gap-2 overflow-hidden rounded-lg border border-line bg-sunken pr-1 pl-[11px]">
            <span className="flex-1 truncate font-mono text-[12px] text-ink-2">{url}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copy()}
              aria-label="Copy feed link"
              className="h-[26px] px-[9px] text-[12px]"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
        <div className="mt-3 flex items-start gap-[9px] text-[12px] leading-[1.5] text-ink-3">
          <Info className="mt-[2px] size-[13px] shrink-0" />
          Anyone with this link can read your calendar. Regenerating it disconnects every app that
          uses the old one.
        </div>
      </div>

      <div className="border-b border-line px-[18px] py-[14px]">
        <div className="eyebrow mb-[10px]">Include</div>
        {INCLUDE_ROWS.map((row) => (
          <div key={row.id} className="flex items-center gap-[9px] py-[7px] text-[13px] text-ink-2">
            <Mark kind={row.mark} className="[--c:var(--ink-3)]" />
            {row.label}
            <Switch
              on={include[row.id]}
              label={row.label}
              onChange={() => void setInclude({ include: { ...include, [row.id]: !include[row.id] } })}
            />
          </div>
        ))}
      </div>

      {url !== undefined && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-[18px] py-[14px]">
          {confirming ? (
            <>
              <span className="text-[12.5px] text-ink-2">Replace the link?</span>
              <Button size="sm" onClick={() => void create()} disabled={busy}>
                Regenerate
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                className="text-ink-3 hover:text-ink"
              >
                <RefreshCw className="size-[13px]" />
                Regenerate link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void disable()}
                className="text-ink-3 hover:text-red"
              >
                Turn off
              </Button>
            </>
          )}
          <span className="ml-auto text-[12px] text-ink-3">
            {prefs?.icsLastFetchedAt === undefined
              ? "Never fetched yet"
              : `Last fetched by ${prefs.icsLastFetchedBy ?? "a calendar app"} ${formatSince(prefs.icsLastFetchedAt)}`}
          </span>
        </div>
      )}

      <TimeZoneSection />
    </>
  );
}

export function TimeZoneSection() {
  const zone = useDisplayTimeZone();
  const prefs = useQuery(api.prefs.get);
  const setTimeZone = useMutation(api.prefs.setTimeZone);
  const browser = browserTimeZone();
  const override = prefs?.timeZone;
  const choices = TIME_ZONE_CHOICES.includes(browser as (typeof TIME_ZONE_CHOICES)[number])
    ? TIME_ZONE_CHOICES
    : [browser, ...TIME_ZONE_CHOICES];

  const change = (value: string) => {
    const next = value === "" ? null : value;
    // Move the UI now; the subscription will confirm it a moment later.
    setDisplayTimeZone(next ?? undefined);
    void setTimeZone({ timeZone: next });
  };

  return (
    <div className="px-[18px] py-[14px]">
      <div className="eyebrow mb-[10px]">Show times in</div>
      <div className="flex h-8 items-center gap-[9px] rounded-lg border border-line bg-surface px-[10px] text-[13px]">
        <Globe className="size-[14px] shrink-0 text-ink-3" />
        <select
          value={override ?? ""}
          onChange={(e) => change(e.target.value)}
          aria-label="Time zone"
          className="w-full bg-transparent text-ink outline-none"
        >
          <option value="">{browser} · browser</option>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex items-start gap-[9px] text-[12px] leading-[1.5] text-ink-3">
        <Clock className="mt-[2px] size-[13px] shrink-0" />
        Canvas stores due times in UTC; the 11:59 PM you see is 11:59 PM in {zone}.
      </div>
    </div>
  );
}

function Switch({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative ml-auto h-4 w-7 shrink-0 rounded-full bg-line-2 transition-colors",
        on && "bg-today",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] left-[2px] block size-3 rounded-full bg-surface transition-all",
          on && "left-[14px]",
        )}
      />
    </button>
  );
}
