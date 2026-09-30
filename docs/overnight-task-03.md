# Overnight task 03: assignment submissions

Fedora, worktree `/home/srinivasib/.t3/worktrees/wiscourse/t3code-43429b90`,
branch `t3code/assignment-submission-workflow`. Nothing is pushed, merged or
deployed. No Convex backend was pushed, codegen was not run, no Canvas
request was made, and no credential, grant or key was created. Every
submission in this work went to the mock Canvas at `canvas.mock.invalid`.

## Commits

Rebased onto task02's repair head `841f0f5b210d12fb332787b051b29403022736a3`
(`t3code/auth-session-adaptive-sync`, clean when rebased; its doc names that
head as the task03 integration point). The first round was reviewed as
`0969806` on `70ecd51`.

| Commit | What |
| --- | --- |
| `829fed4` | feat(submissions): outbox, delivery, panel, mock Canvas, preview (was `f8fe8f0`) |
| `8d1bf60` | docs: first report (was `0969806`) |
| `026c177` | fix(submissions): review repairs (was `5185156` before the rebase) |
| (this doc) | docs: repair round |

The rebase had no conflicts: task02's round touched `auth-provider.tsx`,
`activity.ts`, `syncCadence.ts`, `syncSchedule.ts` and their tests; task03
touches none of them.

## What it does

The assignment view gets a submission panel for assignments whose Canvas
`submission_types` include text entry, URL or upload. Other online types
(media, annotation, LTI, quizzes, discussions) say to submit in Canvas.

1. The student writes text, pastes a URL or picks files, then presses
   **Review submission**. Bad input (empty text, a non-http URL, a file type
   Canvas does not allow, over 10 files or 20 MB) is caught here.
2. A dialog shows exactly what will be sent, with late and new-attempt
   notices. Nothing is sent until **Submit to Canvas**. Files upload to
   Convex storage at this point, so delivery does not depend on the tab.
3. `submissions.submit` stores one `submissionOutbox` row and schedules
   `submissions.send`. The panel shows the row: queued, checking, uploading
   (n of m), sending, waiting, confirmed (with Canvas's attempt number),
   failed, or not confirmed yet.
4. On confirmation the assignment mirror takes Canvas's returned submission
   and the stored files are deleted.

## Repair round (review of `0969806`)

### Upload ownership

The review found that `submit`, the delivery read and file cleanup trusted
any storage id. A storage id is not proof of anything, and a client-supplied
owner would not be either, so ownership is now proved by content:

- `generateUploadUrl({ sha256, size })` records a ticket for the
  authenticated user with the file's SHA-256 (base64, the form Convex keeps
  in `_storage`) and size, valid for an hour.
- `registerUpload({ storageId })` binds a stored file to the caller only if
  one of the caller's open tickets matches that file's hash and size, and
  only if nobody registered it first. A user who knows another user's
  storage id but not the bytes cannot produce a matching ticket.
- `submit` requires each file to be registered to the caller and not yet
  attached; it then records the outbox row on the registration. Delivery
  reads a file only if it is registered to the row's user and row
  (`uploadOwned`), and cleanup deletes only such files.
- Expired, never-attached uploads are deleted a few at a time on the user's
  next `generateUploadUrl`.
- The client hashes with `@noble/hashes` (already a dependency) because Web
  Crypto is missing on non-HTTPS origins.

Regression: B, holding A's storage id, cannot attach it, cannot register
it, and cannot register it after declaring a guessed hash. None of that
reaches Canvas, creates a row or deletes A's file. A then submits the same
file successfully and the file is freed after Canvas confirms.

### Late credential invalidation

`canvasCredentials.revision` is bumped on every `save` (unset reads as 0).
`getCanvasClient` returns it as `session.revision`. It is a counter, not
token material. `credentials.markInvalid({ userId, revision? })` now returns
whether it marked anything; with a revision it does nothing, including
leaving the tripwire schedule alone, unless that revision is still current.
Submissions pass the revision they used. A 401 for a token that a reconnect
has replaced retries with the new token; a 401 for the current token still
marks it invalid and fails the row with "reconnect", as before.

Regression (slow transport): the attempt's check with the first token is
held in flight, the student reconnects (revision 2), and Canvas then
answers the held request with 401. The credential stays active at revision
2, the schedule row stays, and the next attempt submits once.

### One Canvas request per user

Submission attempts now take the same per-user lease as sync
(`syncState.syncLeaseStartedAt`). `syncStore.claimCanvasLease` claims it
without touching sync status; `releaseCanvasLease` is the old `releaseSync`
body, which `releaseSync` now calls. `claim` takes the lease in the same
transaction that starts the attempt. If a sync or another attempt holds it,
the row waits `BUSY_RETRY_MS` (20 s) without spending an attempt. `settle`
(normal finish), the watchdog and a `finally` in the action release it; a
release with a stale lease value changes nothing, and a dead holder stops
blocking after 15 minutes as before. A full sync requested while a
submission holds the lease runs on release.

Regression: a sync holding the lease keeps a submission from making any
request; that submission holding it keeps a second submission for another
assignment and a tripwire sync out; another user's submission runs
alongside. The mock records at most one in-flight request per token and two
across tokens.

### Ambiguous sends

The first round re-sent automatically when a check after a lost send found
nothing. That is unsafe: Canvas can show a new attempt late. Now:

- Once a send may have landed (timeout, network error or 5xx on the POST,
  or a dead action), the row becomes check-only. Automatic attempts only
  read Canvas; a check that finds nothing keeps checking and, when checks
  run out, ends "Not confirmed yet". It never sends on its own.
- "Check Canvas again" (`resume`) runs one check and never sends.
- "Send again…" (`sendAgain({ id, confirmed: true })`) opens the
  confirmation dialog, which warns that Canvas may already have the earlier
  send. The attempt still checks first and stops if the earlier send shows.
  The same path replaces "Try again…" for failed rows.
- A send Canvas answered without taking (403 rate limit, 429, 401 for a
  replaced token) is known not to have landed and still retries
  automatically after a fresh check.

Regressions: a lost reply with Canvas hiding the attempt from the next four
checks (three automatic checks end "Not confirmed yet", repeated "Check
Canvas again" finds it; one POST, one Canvas attempt); a lost send that
never reached Canvas (no automatic resend; one confirmed `sendAgain` sends
once, and a second `sendAgain` while queued is refused); a throttled send
retried; review and cancel in the UI calling nothing.

## Retries and errors

| Error | Result |
| --- | --- |
| 403 "Rate Limit Exceeded", 429 | retry after a check |
| 5xx, network error, timeout before the POST | retry at 30 s, 2 min, 8 min; 4 tries, then failed |
| 5xx, network error, timeout on the POST; dead action | check-only from then on, first check after 90 s or more; "Not confirmed yet" when checks run out |
| other 4xx on the POST, or before any possible send | failed with Canvas's message, no retry |
| `CanvasReconnectRequired` | failed with reconnect, no retry, no Canvas request |
| 401 for the current token | `markInvalid` for that revision, then as above |
| 401 for a token a reconnect replaced | retry with the new token |
| reconnect-required after a possible send | "Not confirmed yet" with reconnect |

## Interfaces

- `submissions.generateUploadUrl({ sha256, size })` then upload, then
  `submissions.registerUpload({ storageId })`, then
  `submissions.submit({ clientKey, assignmentCanvasId, content, confirmed: true })`.
- `submissions.resume({ id })`: "Try now" for a queued row (refused while a
  send may have landed), or one check for an unconfirmed row. Never sends.
- `submissions.sendAgain({ id, confirmed: true })`: failed or unconfirmed
  rows only.
- `credentials.markInvalid({ userId, revision? })` returns `boolean`.
  `CanvasSession.revision` is new. Sync's callers still pass no revision
  (see limits).
- `syncStore.claimCanvasLease` / `releaseCanvasLease` / `LEASE_STALE_MS`;
  `claimSync` and `releaseSync` keep their contracts.
- Schema: `canvasCredentials.revision`, `submissionOutbox.canvasLease`, new
  `submissionUploads` table; `outboxErrorKind` drops `notReceived`.

## Checks

On `026c177` (the integrated head, before this doc):

| Check | Result |
| --- | --- |
| `bun run typecheck` (app, convex, tests) | passed |
| `bun run lint` | passed |
| `bun run test` | passed: 36 files, 293 tests |
| `tests/submissions.test.ts` | 16 passed, including the ownership, late-401, lease and visibility-lag regressions |
| `tests/submission-panel.test.tsx` | 3 passed: nothing sent without confirmation and the same key reused; unconfirmed offers a check and a warned, confirmed resend; reconnect replaces retry |
| reverting each fix | the late-401 test fails without the revision check, the lease test without the lease claim, and two ambiguous-send tests without check-only |
| preview API smoke (mock) | an owned upload registered, and a lost send left the row check-only |
| `convex codegen` | not run; `_generated/api.d.ts` still hand-edited |
| production build, `tests/browser`, UI or CUA pass for this round | not run (UI verification belongs to the coordinator) |

## Mock versus real evidence

Everything ran against the mock Canvas; nothing was sent to a real Canvas.
Unverified on real Canvas: UW's upload replies (inst-fs 201 versus a 3xx
confirmation), `redirect: "manual"` in the Convex runtime, the shape and
timing of `submission_history`, how Canvas rewrites text bodies, and its
error bodies for locked or over-attempt assignments. Unverified on a real
Convex deployment: that `_storage.sha256` is the base64 SHA-256 the client
computes (convex-test and the Convex docs say so), scheduler timing, and
concurrent actions under the lease. The Mac fixture
`wiscourse-p1-reproduction.cjs` concerns task02's auth provider and was not
run here.

## Preview

`http://100.84.133.110:46867/` (Tailscale only, preview id
`fb1bac03247abbb15998`), serving this worktree with the mock backend and
mock Canvas. It now includes "Reply lost, Canvas slow to show it" and the
check-only behaviour; the browser pass is the coordinator's.

## Remaining limits

- Sync's `handleSyncError` still calls `markInvalid` without a revision, so
  a sync request whose token was replaced mid-flight can still invalidate
  the new credential. The fix is to pass `session.revision`; it touches
  `sync.ts`, which I left for task02 or the parent to avoid a cross-branch
  conflict.
- If Canvas never shows an accepted send, the row stays "Not confirmed yet"
  until the student checks Canvas and dismisses it or confirms a resend.
  A resend while the first send is still invisible can make a second Canvas
  attempt; the dialog says so.
- Text matching after a lost reply can misjudge a body Canvas rewrote; the
  result is "Not confirmed yet", never an automatic resend.
- A student who submits the same assignment in Canvas while a row is queued
  may have that attempt counted as ours (same type and content) or flagged
  as a conflict. Nothing is sent twice.
- The lease has one holder per user, so a long full sync delays a
  submission by up to its length (polled every 20 s), and a dead holder
  blocks for up to 15 minutes. A dead submission attempt stays "sending"
  for up to 11 minutes before the watchdog moves it on.
- An upload that is stored but never registered (tab closed between the
  two calls) leaves an orphan blob with no owner record to clean it up.
- Files are held in action memory one at a time, capped at 20 MB.

## Draft PR body (not opened; waiting for coordinator CUA and review)

Title: Assignment submissions through a confirmed, durable outbox

> Roadmap M6: submit text, URLs and files to Canvas from the assignment
> view. Stacked on the task02 branch (`CanvasReconnectRequired`, drafts,
> retained-client fix).
>
> **Flow**
> - Compose, review in a confirmation dialog, submit. Files go to Convex
>   storage first, registered to the uploader by content hash; a scheduled
>   action delivers the outbox row.
> - The panel shows queued, checking, uploading, sending, waiting,
>   confirmed (Canvas's attempt number), failed and not confirmed. Nothing
>   is marked submitted until Canvas confirms.
>
> **No duplicates**
> - Client key per confirmation; one open submission per assignment;
>   numbered attempts with an 11-minute watchdog.
> - Every attempt reads Canvas's submission history first. After a send
>   that may have landed, the row only checks; only the student can send
>   again, through a warned confirmation.
> - Submissions share the per-user Canvas lease with sync: one request in
>   flight per token.
>
> **Errors**
> - Throttling and outages before a send retry at 30 s, 2 min, 8 min.
> - Refusals are final and show Canvas's message.
> - A missing or rejected credential stops without retry and points to
>   Settings; a late 401 for a replaced token does not invalidate the new one.
>
> **Testing**: typecheck, lint, 293 tests including 19 for submissions
> against a mock Canvas. A mock-only preview (`tests/submission-preview`)
> covers each scenario. Nothing has been sent to a real Canvas.
>
> **Before merge**: run `convex codegen` (api.d.ts edited by hand). No data
> migration; `allowedExtensions` fills in on the next full sync. Pass the
> credential revision from sync's `handleSyncError` too.
