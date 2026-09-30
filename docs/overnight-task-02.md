# Overnight task 02: auth/session reliability and adaptive sync

Fedora, worktree `/home/srinivasib/.t3/worktrees/wiscourse/t3code-e4b713bc`,
branch `t3code/auth-session-adaptive-sync`. Nothing is pushed, merged or
deployed. No Convex backend was pushed (dev or prod), no Canvas request was
made, and no credential, grant or developer key was created.

## Commits

Base is `origin/main` at `dfc7c0c` (PR #10 merge). The local `main` checkout
at `/home/srinivasib/Developer/wiscourse` sits at `914e68c`, an ancestor of
`origin/main`, so it was not used as the base.

| Commit | What |
| --- | --- |
| `3b5d8d0` | Existing `t3code/review-auth-state-management` commit, unchanged. It sat directly on `dfc7c0c`, so it fast-forwarded. |
| `e483252` | fix(drafts): two bugs found reviewing `3b5d8d0` |
| `05e59b2` | feat(sync): adaptive polling, heartbeat, connection health |
| `70ecd51` | docs: this report (reviewed head) |
| `0481b9f` | fix(auth): P1 from review, retained client authenticated as another account |
| `33b5678` | fix(sync): steady idle cadence and a hard 5-minute heartbeat bound |
| `841f0f5` | docs: repair round (published head of PR #11) |
| `e1ab764` | fix(auth): Bugbot HIGH / Astra P1, retained owner's queued writes sent without auth |
| `2af8bf1` | fix(drafts): Astra P2, stale saved draft revived by a source cycle |
| (this doc update) | docs: review round 2 |

### Review of `3b5d8d0`

I kept its design: per-owner Convex client, bounded token fetches, the
`sub` continuity check, `isRefreshing`-driven recovery (Convex only raises it
after a server-rejected token, not on routine refresh), bounded sign-out, and
the in-memory `DraftStore`. Two confirmed bugs, fixed in `e483252`:

1. **Stale todo edits came back and could be saved.** Title and notes drafts
   were keyed by the server value (`todo:notes:${value}`). Edit notes `A` to
   `AB` and save, then edit back to `A` and save: the key `todo:notes:A` still
   held `AB`, so the field showed `AB`, and the next blur wrote it back.
   `useSourcedDraft` stores the source with the edit; a new server value wins.
2. **Dialogs reopened on return to a route.** Drafts were scoped by pathname
   and never dropped, so a dialog left open when navigating away (browser
   back, ⌘J) popped open again on return, and quick-add, which is app-wide,
   closed on navigation. `DraftRoute` now drops a route's drafts when the
   route changes but not on an auth remount. Quick-add sits outside the
   route scope and stays open across navigation, as it did before `3b5d8d0`.
   Behaviour change: an unsent chat or form draft no longer survives
   navigating away, which matches pre-`3b5d8d0` behaviour.

## Adaptive sync (roadmap M5)

The overview's plan was "tripwire every 2 min while the user is active
(5-min client heartbeat), else 15 min". That is what now runs, with idle
probes on the last 2-minute tick inside the 15 minutes, a steady 14.

- `syncSchedule` table: one row per user with an active credential, fields
  `dueAt`, `activeUntil`, `lastDispatchedAt`, index `by_dueAt`. It is separate
  from `syncState` so heartbeats never re-run `credentials.status`.
- Cron `canvas tripwire` runs every 2 minutes (was 5). `sync.dispatchTripwire`
  reads only due rows (100 per transaction, continuing if full), checks the
  credential, reschedules, and enqueues one Workpool job per user. Crons still
  never loop over all users. `WISCOURSE_BACKGROUND_SYNC=false` still stops it
  before any read.
- `syncSchedule.heartbeat` (public, authenticated): extends `activeUntil` to
  now + 7 min; duplicate beats within a minute write nothing. A return from
  idle moves `dueAt` to the next tick unless a probe ran moments ago.
- Client `useActivityHeartbeat` (mounted in the root layout): beats on open,
  input, return (visibility, focus) and reconnect, never more than once per
  5 min, never while hidden or offline. The 7-minute server window outlasts
  that gap, so a return after the window lapsed always beats. A tab left
  open without input lapses to idle.
- Queue lifecycle: `credentials.save` adds the row, `markInvalid` and
  `disconnect` remove it, the dispatcher drops orphans, the nightly full-sync
  dispatcher re-adds missing rows, and the first heartbeat enrols a connected
  account without a row.

Rough Convex call budget for one user (Workpool overhead taken as ~5 calls per
job): before, 288 dispatcher runs plus 288 tripwire jobs a day, about 1,700
calls. Now 720 dispatcher runs plus about 90 active and 90 idle tripwire jobs
for 3 active hours, about 1,600 calls. Per-user job cost falls from 288 to
about 100-175 a day, so the gap widens with users.

## Connection health and notifications

- `ConnectionBanner`: after 4 s without the Convex socket (or offline), a
  small status pill says the app is showing saved data and that changes send
  on reconnect. Silent before the first connection; auth failures keep their
  own recovery screen.
- Home's sync line says "Sync delayed · last synced …" when nothing ran for
  20 minutes with no sync in progress, no error and a valid token. That catches
  a stuck scheduler or disabled polling.
- `getCanvasClient` throws `CanvasReconnectRequired("missing" | "invalid")`.
  Background jobs record it and stop, instead of Workpool retrying a dead
  credential three times per tick.
- Notifications: I built no outbox. Push needs a service worker and a VAPID
  key pair, which is a new credential and out of scope tonight. The inbox
  (announcements, posted grades, assignment changes, per-item `seenAt`) is
  already the event log a push deliverer would read. What was missing was
  knowing whether the user is in the app; `syncSchedule.activeUntil` now
  answers that, so a deliverer can skip pushes while the app is open and keep
  a per-user watermark over the inbox feed.
- Token expiry: manual tokens carry no `expiresAt` (Canvas does not report a
  pasted token's expiry), so the existing 14/7/1-day UI only applies once
  OAuth or a user-entered date sets it. Not changed. UW now caps manual
  tokens at 90 days, not 120 (KB 156712, updated 2026-08-20); the settings
  copy, a code comment and the overview now say 90.

## Interfaces for task03 (submissions)

- `getCanvasClient(ctx, userId)` is unchanged in shape. It now throws
  `CanvasReconnectRequired` (exported from `convex/credentials.ts`) for a
  missing or invalid credential. Treat it as a permanent failure: mark the
  outbox row failed with a reconnect message, and do not retry.
- A `CanvasAuthError` during a request means Canvas rejected the token. Call
  `internal.credentials.markInvalid` (it now also removes the user from the
  tripwire queue), as `sync.handleSyncError` does.
- The Convex client survives auth recovery (one client per signed-in user),
  but actions are not replayed after a dropped socket. Submit through a
  mutation that writes an outbox row, then schedule the Canvas action from
  it. Show pending/failed from the row; never optimistic.
- Form state: use `useDraft` for fields and the pending flag, and
  `useDiscardDrafts` on intentional close. Drafts survive auth remounts, are
  dropped on navigation, and do not survive reload.
- `useOnline()` moved to `src/lib/online.ts`. `ConnectionBanner` already tells
  the user when writes are waiting on a connection.

## Checks

Original round, on `05e59b2`, all passing (see the repair round for the
current head):

- `bun run typecheck` (app, convex, tests)
- `bun run lint`
- `bun run test`: 34 files, 270 tests. New: `tests/sync-schedule.test.ts`
  (cadence, promotion, dedupe, queue lifecycle, backfill, no-retry on missing
  credential), `tests/connection-health.test.tsx` (heartbeat throttling and
  gating, banner grace and recovery, delayed rule), two draft tests in
  `tests/drafts.test.tsx`. The existing `sync-io`, `io-observed` and
  `io-workload` suites pass unchanged.

`convex/_generated/api.d.ts` was edited by hand for the two new modules,
because running codegen contacts the deployment. Run `convex codegen` before
merge and confirm it produces no diff.

Not verified: a signed-in browser session against a backend with these
functions, real Clerk expiry and cross-tab switches, and the
`tests/browser` harness (not re-run; it does not cover the new pieces).

## Preview

`http://100.84.133.110:50285/` (Tailscale only, preview id
`5d8c067da2c77570c104`, frontend of this worktree against the existing dev
Convex URL). Checked on Fedora: HTTP 200, and the sign-in page renders. Laptop
reachability unverified. Sign-in is required. The dev backend does not have
`syncSchedule.heartbeat` yet, so beats fail silently there and polling stays
on the old 5-minute cron until the backend is pushed.

## Rollout (for the coordinator)

1. Push backend (schema adds a table and index; no data migration).
2. Run `convex run syncSchedule:backfill` once. Without it, existing accounts
   get no tripwires until their next heartbeat or the 03:00 nightly sync.
3. Ship the frontend. Clients still on the old bundle send no heartbeats, so
   those users poll at the idle cadence (14 minutes) until they reload.

## Risks

- Idle polling drops from 5 to 14 minutes. Anything reading data while the
  user is away (ICS feeds, a future push deliverer) sees it later. The
  constant is `IDLE_TRIPWIRE_MS` in `convex/lib/syncCadence.ts`.
- Anyone signed in can call `heartbeat`. It affects only their own cadence
  and at worst yields a probe every 2 minutes.
- "Sync delayed" could show wrongly if a full sync ran over 20 minutes
  without holding `status: "syncing"`; I found no path that does that.

## Canvas OAuth prerequisites

Web research only (2026-09-30); nothing was requested, submitted or created.
No onboarding is implied: the overview's rule still holds that no second user
joins before an institution-issued developer key exists.

- UW-Madison publishes no developer-key process that I could find. Learn@UW's
  request forms (kb.wisc.edu/luwmad/93459) list only "Request a Canvas Access
  Token" and "Canvas External/Third-Party Integration". The integration page
  (kb.wisc.edu/luwmad/70088) targets vendor tools, quotes 3-4 months and asks
  for use case, start date and student count, plus privacy, IP, security and
  records-retention review. Whether that path covers a developer key is
  unverified; ask learnuwsupport@wisc.edu.
- A cybersecurity risk review (OneTrust intake, SOC 2/HECVAT/data-flow
  materials, 1-3 months) applies to technology handling restricted data.
  Grades are restricted data. Whether a student-run app triggers it is
  unverified. The "Level 4" review and a faculty-sponsor requirement mentioned
  in the overview were not found on UW-Madison pages.
- Manual tokens: students cannot self-issue since 2025-11-14; admins issue
  them through a 1Password link, maximum 90 days (kb.wisc.edu/luwmad/156712).
- Instructure: multi-user apps must use OAuth
  (canvas.instructure.com/doc/api/file.oauth.html). Endpoints
  `/login/oauth2/auth`, `/login/oauth2/token` (authorization_code,
  refresh_token), `DELETE /login/oauth2/token`. Access tokens last 1 hour and
  refresh reuses the same refresh token. The key belongs to the institution's
  root account; with enforced scopes, an endpoint outside the key's scopes
  returns 401. The API policy requires disclosing what the app does on the
  user's behalf.
- Scopes a read-plus-submit app would list: course, assignment, submission
  (GET and POST), submission file upload, activity stream summary, calendar
  events, announcements, discussion topics, files, and user profile.
- Code seam: `getCanvasClient` already has the Phase 3 refresh placeholder
  and the credential table has `refreshTokenEncrypted`, `expiresAt` and
  `scope`. A 401 from an enforced-scope miss would currently read as a
  disabled tab or, with a `WWW-Authenticate` header, as a dead token. Check
  that distinction when OAuth lands.
- Prepare before contacting Learn@UW: product description and who runs it;
  endpoint and scope list with reasons (writes limited to submissions);
  production and dev redirect URIs; a Canvas → Convex/Clerk/Vercel data-flow
  diagram with stored fields, retention and deletion; vendor security
  documents; privacy policy and terms covering Instructure's notice rules; a
  sponsor if one exists.

## Repair round (after review of `70ecd51`)

Same worktree and branch, on Fedora. Mocked only: jsdom, fake Clerk, the
installed `ConvexReactClient` over `tests/helpers/auth-server.ts`, and
`convex-test`. No backend, Canvas, deployment or push.

### P1: retained client authenticated as another account

Cause: `AuthProvider` kept the last owner's client whenever Clerk was
unresolved (loading, error, degraded), even if Clerk already reported a
different signed-in user. `BackendSession` remounted for the new session on
that same client, and `useClerkAuth` checked tokens against the user Clerk
currently reported. So B's token passed the check on A's client, and A's
offline-queued mutation went out under B.

Reproduced on the unfixed code with the scenario from the review handoff
(the Mac fixture file was not needed): authenticate A, close the socket,
queue `todos.createLocal` for A, report Clerk `status: "error"` with user B
and session B, rerender, wait 2 s. Frames on the only client:

```
Connect, Auth:user-A, ModifyQuerySet, Auth:user-A, Connect, Auth:user-B,
ModifyQuerySet, Mutation:[{"title":"Private queued A mutation"}], Auth:user-B
```

This matches the recorded evidence (`clients=1`, retained client, A's
mutation after B's authentication).

Fix (`0481b9f`, `src/components/app/auth-provider.tsx`):

- Any report of a different signed-in user, resolved or not, becomes the
  owner at once. The previous owner's `UserSession` unmounts, which closes its
  client, socket and queue, and drops its drafts. Only a report of no user or
  the same user keeps the previous owner, so same-owner recovery still keeps
  the client and drafts.
- Every token fetcher checks tokens against its client's owner (passed down
  through the recovery context), not against whoever Clerk currently reports.
- While Clerk reports another account, `useClerkAuth` reports loading, so
  the client's auth is left alone until it is disposed.

Regression (`tests/auth-transport.test.tsx`, "never lets an unresolved Clerk
state carry another user's token onto a retained client"): one controlled
peer per client, so each frame is tied to the client that sent it. It asserts
that A's client only ever authenticates as A and sends no mutation, all of
A's sockets are closed, and B's new client authenticates only as B and sends
no mutation. It fails on `70ecd51` and passes now. Already covered and still
passing: ordinary ready account switch (queued mutation never sent; drafts
cleared), temporary same-owner Clerk loading (client kept). Added: a
same-owner Clerk error keeps the client and drafts.

### Cadence against the 2 / 15 / 5-minute requirements

A new tick simulation (`tests/sync-schedule.test.ts`, "holds a steady cadence
under cron jitter") runs 90 two-minute cron ticks, each a little late by a
varying amount, with heartbeats for ticks 46-53. Two defects showed up:

1. Idle due times landed exactly on a tick, so jitter decided whether a
   probe ran on it or waited another tick. Probe ticks and gaps (minutes) on
   `70ecd51`:

   ```
   ticks [1,9,16,24,31,39,46,47,...,57,65,73,80,88]
   gaps  [16,14,16,14,16,14,2,2,2,2,2,2,2,2,2,2,2,16,16,14,16]
   ```

   Half the idle gaps broke the 15-minute period. `nextTripwireAt` now puts
   the due time midway between ticks, on the last tick within the period.
   After `33b5678`:

   ```
   ticks [1,8,15,22,29,36,43,46,47,...,57,64,71,78,85]
   gaps  [14,14,14,14,14,14,6,2,2,2,2,2,2,2,2,2,2,2,14,14,14,14]
   ```

   Active stays exactly 2 minutes; a return from idle is probed on its own
   tick (the 6-minute gap at tick 46).
2. Return events (focus, visibility, online) used a 1-minute gap, so tab
   switching sent 7 beats in 9 minutes against a 5-minute bound, each a
   database write. All events now share the 5-minute gap; the result is 2.
   Because the server's 7-minute active window is longer than the client's
   gap, a return after the window has lapsed still beats and promotes the
   next probe.

Not changed, checked as intended: 2-minute active cadence, promotion on
return, 7-minute active window, 1-minute server dedupe for several tabs, and
the 20-minute "Sync delayed" threshold (still above the 14-minute idle gap
plus two ticks).

### Checks at `33b5678`

- `bun run typecheck`, `bun run lint`: clean.
- `bun run test`: 34 files, 274 tests passing. New in this round: the P1
  transport regression, the same-owner Clerk error test, the cadence tick
  simulation, and the tab-switching heartbeat bound. Each new regression
  was run against the pre-fix file and failed there.

### Integration for task03

- New task02 head: the commit that adds this section, on top of `33b5678`.
  Task03 (`0969806`) includes `70ecd51`, so it rebases onto this head. Files
  touched in this round: `src/components/app/auth-provider.tsx`,
  `convex/lib/syncCadence.ts`, `convex/syncSchedule.ts`, `src/lib/activity.ts`,
  `tests/auth-transport.test.tsx`, `tests/auth-recovery.test.tsx`,
  `tests/sync-schedule.test.ts`, `tests/connection-health.test.tsx`, this doc.
- No exported backend interface changed. `getCanvasClient`,
  `CanvasReconnectRequired`, `credentials.markInvalid`, the sync lease
  (`syncStore.claimSync`/`releaseSync`) and `createTokenFetcher`'s signature
  are unchanged. `nextTripwireAt(now, active)` keeps its signature; only the
  due time it returns changed. `HEARTBEAT_DEDUPE_MS` is now server-only.
- Client: the recovery context now carries `owner`. That is internal to
  `auth-provider.tsx`. Submission UI under the provider gets the same
  guarantee as any mutation: a queued write is never sent under another
  account; it is dropped with its owner's client. Its outbox rows must
  therefore be written by a confirmed mutation before showing "pending", as
  the task03 interface notes above already say.
- If task03 edited `auth-provider.tsx`, resolve toward this version's owner
  derivation and fetcher binding, then rerun the transport regression.

### Remaining limits

- Not verified in a signed-in browser or against a real backend. Real Clerk
  multi-session switching and cross-tab behaviour are unverified.
- The Mac fixture `wiscourse-p1-reproduction.cjs` was not run here, because
  Fedora cannot read that path. The Vitest regression reproduces the same
  frame sequence. Transfer the file if the exact fixture must be rerun on
  Fedora.
- The Tailscale preview serves this worktree's current files through Vite.
  The dev backend still lacks the new functions.

## Review round 2 (PR #11 at `841f0f5`)

Same worktree and branch, on Fedora, mocked only: jsdom, fake Clerk, the
installed Convex 1.43.0 `ConvexReactClient` over the controlled peer in
`tests/helpers/auth-server.ts`. No push, backend, credentials or Canvas.

Inputs: the only PR review comment, Bugbot HIGH
[discussion_r4149537499](https://github.com/IBS27/wiscourse/pull/11#discussion_r4149537499);
the other PR comments are the Vercel deploy notice and Bugbot's summary. Also
Astra's independent review (`/tmp/pr-babysit-20260930/reviews/wiscourse-11/`
`review.md`, `urgent.md`, `auth-gap-observations.jsonl`,
`snapshot/tests/reviewer-*.test.tsx`), which confirms the Bugbot finding as
P1 and adds a P2 on drafts. I read their tests but did not edit anything in
that directory.

### P1: a retained owner's queued writes went out without auth (`e1ab764`)

Cause. The installed `ConvexProviderWithAuth` calls `client.clearAuth()` in
an effect cleanup whenever `isLoading`, `isAuthenticated` or `fetchAccessToken`
changes, or when it unmounts. During a Clerk gap the provider kept A's client,
but `useClerkAuth` changed its flags (`isLoading: !isLoaded`,
`isAuthenticated: isSignedIn`), and a missing `sessionId` also remounted
`BackendSession`. After `clearAuth`, the next socket replayed A's queue with
no `Authenticate`, and the server's `requireUserId` rejects that permanently.
A second path had the same result: with Clerk ready, a failed or timed-out
token refresh resolved `null`, so the SDK sent `Authenticate None` and replayed
the queue anonymously.

Reproduced on `841f0f5`: authenticate A, close the socket, queue
`todos.createLocal`, enter the gap, reconnect. Frames per socket:

```
degraded, no user      [Connect, Auth:A, ModifyQuerySet, Auth:A], [Connect, ModifyQuerySet, Mutation]
error, no user         [Connect, Auth:A, ModifyQuerySet, Auth:A], [Connect, ModifyQuerySet, Mutation]
not loaded             [Connect, Auth:A, ModifyQuerySet, Auth:A], [Connect, ModifyQuerySet, Mutation]
gap past token expiry  [Connect, Auth:A, ModifyQuerySet, Auth:A, Auth:none], [Connect, ModifyQuerySet], [Connect, ModifyQuerySet, Mutation]
failed refresh, Clerk ready
                       [Connect, Auth:A, ModifyQuerySet, Auth:A, Auth:none], [Connect, ModifyQuerySet, Mutation, Auth:none]
```

After the fix, every mutation follows `Auth:user-A` on its own socket, and
no `Auth:none` is ever sent:

```
degraded / error / not loaded  [..., Auth:A], [Connect, Auth:A, ModifyQuerySet, Mutation]
gap past token expiry          [...], [Connect, Auth:A, ModifyQuerySet], [Connect, Auth:A, ModifyQuerySet, Mutation, Auth:A]
```

Fix, in `src/components/app/auth-provider.tsx` and `src/lib/auth-recovery.ts`:

- Through a gap, `useClerkAuth` keeps reporting the owner as authenticated
  with the same fetcher, so the Convex provider's inputs don't change and it
  never calls `clearAuth`. `UserSession` keeps the last non-empty
  session/org key, and the hook keeps the last token template. Protected UI
  is still hidden by `AuthBoundary` (`SessionLoading`).
- Token requests made during a gap wait on a gate until Clerk returns; the
  10-second bound starts after that.
- The fetcher answers `null` only on cancellation (the client is disposed or
  the fetcher replaced). A failure or timeout goes to the recovery UI through
  the existing `failure` state, and the request stays pending, which keeps
  the socket paused or stopped.
- Retry (automatic, Retry button, focus, online) re-requests pending tokens
  in place. The SDK then finishes its own reauthentication, which is the only
  path that restarts a stopped socket. A new fetcher (the old generation bump)
  is used only when nothing is pending, e.g. after the server rejects tokens.
- Kept: immediate disposal on confirmed logout or on any other signed-in
  user, resolved or not (`0481b9f`), owner-bound token `sub` checks, and
  restarts on a real session or organisation change.

Regressions (`tests/auth-transport.test.tsx`, "a retained owner's queued
write"). The peer now records who sent each mutation and rejects anonymous
ones with "Not signed in", following Astra's peer. The tests cover Astra's
five variants (error, degraded and loading with the session missing; error
and loading with the session unchanged), a gap past token expiry, and a
failed refresh while Clerk is ready. Each asserts exactly one mutation, sent
as `user-A`, no rejection, one client, no `clearAuth` in the gap variants,
and that the draft is kept. All 7 fail on `841f0f5` and pass now. Astra's own
defect test, run unmodified against the fix, fails all 5 cases (`clearAuth`
is no longer called). Inverted, it passes all 5 with `mutationOwners:
["user-A"]`. I removed the temporary copies afterwards. Existing tests for
foreign-owner switching (ready and unresolved), confirmed logout, late tokens
after logout, session/org restarts, bounded recovery and exhaustion, offline
resume, and same-owner loading/error all still pass.

### P2: a saved draft came back after a remote restore (`2af8bf1`)

`useSourcedDraft` chose the new server value for display but kept its stored
`{source, value}` pair. Title or notes `A`, edit to `AB` and save, server
confirms `AB`, another tab restores `A`: the old `{A, AB}` pair matched again,
so TodoDetail showed `AB` and blurring saved it. The pair now moves to each
new server value the component renders, so an edit lasts only while the value
it was made against is unchanged. Unsaved edits still survive remounts while
the server value stays the same.

Coverage: `tests/todo-detail-drafts.test.tsx` runs the actual `TodoDetail` for
title and notes. It checks that the restore is shown, blur issues no stale
mutation, an auth remount still shows the server value, and an unsaved edit
survives a remount. `tests/drafts.test.tsx` adds the hook-level cycle. The 3
cycle tests fail on `841f0f5` and pass now; the 2 unsaved-edit tests pass on
both. Astra's three defect repros (`reviewer-todo-draft` title/notes,
`reviewer-sourced-draft`) now fail as intended: the fix shows `A` where they
expect `AB`.

### Checks at `2af8bf1`

- `bun run typecheck`, `bun run lint`, `git diff --check`: clean.
- `bun run test`: 35 files, 286 tests passing.

### Interface notes for task03 and the stack

- `createTokenFetcher` now returns `{ fetchAccessToken, cancelPending,
  retryPending }`, takes an optional `whenReady`, and never resolves `null`
  except on cancellation. `createGate` is new. Both are internal to the auth
  provider.
- A queued write from task03's submission UI now waits through a Clerk gap
  or a failed refresh and is sent once as its owner. It is still dropped,
  never sent, if the owner changes or signs out. Confirmed outbox rows remain
  the source of truth for pending/failed states.
- `tests/helpers/auth-server.ts` adds `mutationOwners`, per-socket `sent`,
  `subjectOf`, and rejects anonymous mutations. Stack tests that rely on
  anonymous mutations being ignored would need updating; none do in this
  branch.
- No backend or cadence file changed in this round.

### Remaining limits

- Mocked only. Not checked in a signed-in browser against real Clerk
  outages, expiry or cross-tab session changes.
- On reconnect, Convex re-sends its cached token even if it has expired. The
  mock accepts it, but a real server answers `AuthError`, and the SDK then
  reauthenticates using the held-request path above. The server's handling of
  a mutation that arrives right after an expired `Authenticate` belongs to the
  SDK and server, and I did not observe it.
- If the server rejects freshly fetched tokens repeatedly (a configuration
  fault), the SDK itself gives up and clears auth after its attempt limit.
  Writes would fail in that state anyway.
- A held request has no automatic end. The recovery screen offers Retry,
  Reload and Sign out, and SessionLoading offers Reload.
- Drafts: a source cycle that finishes while the detail view is not rendered,
  or within one batched update, isn't seen, so an older pair could still
  match. That needs a save confirmed and reverted entirely while the view is
  unmounted.

## Draft PR body (not opened; waiting for coordinator review)

Title: Auth session recovery, draft preservation, and adaptive Canvas polling

> Builds on the auth/session work from `t3code/review-auth-state-management`
> (`3b5d8d0`, unchanged) and finishes roadmap M5's polling.
>
> **Auth and drafts**
> - Bounded token fetches and sign-out, recovery screens, per-user client and
>   token isolation (`3b5d8d0`).
> - Fix: an unresolved Clerk state reporting a different user no longer
>   keeps the previous owner's client; token fetchers are bound to their
>   client's owner, so a queued mutation can never replay under another
>   account.
> - Fix: a Clerk gap (loading, error or degraded with no user) or a failed
>   token refresh no longer drops the owner's client to anonymous auth;
>   queued writes wait and are sent once, as the owner.
> - Fix: todo title/notes drafts no longer resurrect an older edit after a
>   later save or a remote restore; route drafts drop on navigation but
>   survive auth remounts; quick-add stays app-wide.
>
> **Adaptive polling**
> - Tripwire queue (`syncSchedule`) read by due time: 2 min while the app is
>   in use, 14 min idle (inside the 15-minute budget), next tick on return.
>   Cron every 2 min.
> - Input-driven heartbeat, at most every 5 min, only while visible and online.
> - Queue follows the credential; nightly self-heal; one-off backfill.
> - `getCanvasClient` throws `CanvasReconnectRequired`; jobs stop retrying a
>   missing or invalid credential.
>
> **Connection health**
> - Offline/reconnecting pill after 4 s; "Sync delayed" on Home when polling
>   goes quiet.
> - Manual token copy corrected to UW's 90-day maximum.
>
> **Rollout**: push backend, run `syncSchedule:backfill` once, ship frontend.
> Run `convex codegen` first; `_generated/api.d.ts` was edited by hand.
>
> **Checks**: typecheck, lint, 286 tests. Signed-in browser verification is
> still pending.
