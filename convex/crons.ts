import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Tier 1: cheap change-detection probe. The dispatcher fans out one
// Workpool job per user — never loop users inside a cron (overlapping
// cron runs are skipped, so a slow loop drops cycles silently).
crons.interval(
  "canvas tripwire",
  { minutes: 5 },
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
