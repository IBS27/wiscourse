import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { DISPATCH_TICK_MS } from "./lib/syncCadence";

const crons = cronJobs();

// Tier 1: cheap change-detection probe. Each tick the dispatcher reads only
// the users whose probe is due (2 min while active, else 15; see
// syncSchedule.ts) and fans out one Workpool job per user — never loop users
// inside a cron (overlapping cron runs are skipped, so a slow loop drops
// cycles silently).
crons.interval(
  "canvas tripwire",
  { minutes: DISPATCH_TICK_MS / 60_000 },
  internal.sync.dispatchTripwire,
  {},
);

// Nightly full sync. 09:00 UTC = 03:00/04:00 in Madison.
crons.daily(
  "canvas full sync",
  { hourUTC: 9, minuteUTC: 0 },
  internal.sync.dispatchFullSync,
  {},
);

export default crons;
