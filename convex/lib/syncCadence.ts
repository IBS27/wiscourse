// How often the tripwire probes Canvas. Shared with the client, which sends
// the heartbeat and judges whether sync has fallen behind.

const MINUTE_MS = 60_000;

/** The dispatcher cron's period. Every due user is probed on the next tick. */
export const DISPATCH_TICK_MS = 2 * MINUTE_MS;
/** Tripwire period while the user has the app open and in use. */
export const ACTIVE_TRIPWIRE_MS = 2 * MINUTE_MS;
/** Tripwire period otherwise. A return to the app promotes the next probe. */
export const IDLE_TRIPWIRE_MS = 15 * MINUTE_MS;
/** A client in use beats at most this often. */
export const HEARTBEAT_MS = 5 * MINUTE_MS;
/** One missed beat, plus room for throttled background timers, ends activity. */
export const ACTIVE_WINDOW_MS = HEARTBEAT_MS + 2 * MINUTE_MS;
/** Beats this close together (several tabs) change nothing. */
export const HEARTBEAT_DEDUPE_MS = MINUTE_MS;
/**
 * With no sync for this long, and none running, the client reports sync as
 * delayed. An idle probe can be this old when the app opens, until the
 * promoted probe lands a tick or two later.
 */
export const SYNC_DELAYED_MS = IDLE_TRIPWIRE_MS + 2 * DISPATCH_TICK_MS + MINUTE_MS;

/**
 * The next probe for a user. Half a tick early, so a cron firing slightly
 * ahead of schedule still catches it instead of waiting another tick.
 */
export function nextTripwireAt(now: number, active: boolean): number {
  return now + (active ? ACTIVE_TRIPWIRE_MS : IDLE_TRIPWIRE_MS) - DISPATCH_TICK_MS / 2;
}
