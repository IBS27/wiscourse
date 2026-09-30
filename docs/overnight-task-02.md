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
| (this doc) | docs: this report |

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
(5-min client heartbeat), else 15 min". That is what now runs.

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
  on return (visibility, focus, online), and on input at most every 5 min.
  Never while hidden or offline. A tab left open without input lapses to idle.
- Queue lifecycle: `credentials.save` adds the row, `markInvalid` and
  `disconnect` remove it, the dispatcher drops orphans, the nightly full-sync
  dispatcher re-adds missing rows, and the first heartbeat enrols a connected
  account without a row.

Rough Convex call budget for one user (Workpool overhead taken as ~5 calls per
job): before, 288 dispatcher runs plus 288 tripwire jobs a day, about 1,700
calls. Now 720 dispatcher runs plus about 90 active and 84 idle tripwire jobs
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

On `05e59b2`, all passing:

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
   those users poll at the idle 15-minute cadence until they reload.

## Risks

- Idle polling drops from 5 to 15 minutes. Anything reading data while the
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

## Draft PR body (not opened; waiting for coordinator review)

Title: Auth session recovery, draft preservation, and adaptive Canvas polling

> Builds on the auth/session work from `t3code/review-auth-state-management`
> (`3b5d8d0`, unchanged) and finishes roadmap M5's polling.
>
> **Auth and drafts**
> - Bounded token fetches and sign-out, recovery screens, per-user client and
>   token isolation (`3b5d8d0`).
> - Fix: todo title/notes drafts no longer resurrect an older edit after a
>   later save; route drafts drop on navigation but survive auth remounts;
>   quick-add stays app-wide.
>
> **Adaptive polling**
> - Tripwire queue (`syncSchedule`) read by due time: 2 min while the app is
>   in use, 15 min idle, next tick on return. Cron every 2 min.
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
> **Checks**: typecheck, lint, 270 tests. Signed-in browser verification is
> still pending.
