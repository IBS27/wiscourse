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
| `3772d21` | docs: repair round (reviewed head for the P2 round) |
| `eed2c6e` | fix(submissions,sync): exact credential identity and server-bound uploads (P2 round) |
| (this doc) | docs: P2 round |

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

### Upload ownership (reworked in the P2 round)

The first repair proved ownership by content hash. The P2 review pointed
out that knowing a hash and size is not proof that this user uploaded this
blob, so hash tickets are gone. Ownership is now bound by the server at the
moment of storage:

- `POST /submissions/upload` (`submissions.uploadFile`, an HTTP action)
  takes the file as the body and the user's Convex token as a bearer
  token. It checks the identity, stores the bytes itself with
  `ctx.storage.store`, and records `{ userId, storageId }` through the
  internal `recordUpload` in the same request. The storage id is returned
  only to that caller.
- `generateUploadUrl` and `registerUpload` are removed. No function accepts
  a storage id or a hash as proof of upload.
- `submit` accepts a file only if its storage id was recorded for the caller
  and is not yet attached. Delivery reads a file only if it is recorded for
  the row's user and row (`uploadOwned`), and cleanup deletes only such
  files. Unattached uploads expire after a day and are deleted a few at a
  time on that user's next upload.
- CORS on the endpoint allows any origin but no cookies; only the caller's
  own bearer token authenticates it. `OPTIONS` answers the preflight.
- The client (`src/lib/submission-upload.ts`) gets the token from Clerk the
  way the Convex client does (native audience, else the `convex` template)
  and posts to `VITE_CONVEX_SITE_URL`. `auth-provider.tsx` is untouched. If
  Clerk has already switched accounts under an old client, the upload is
  recorded for the new account and the old client's `submit` fails closed.
- `MAX_FILE_BYTES` is 20,000,000, inside Convex's 20 MB HTTP body limit.

Regression: A has one blob stored outside the upload action and one
uploaded properly. B knows both storage ids and the bytes, so the hash and
size too. B cannot attach either, B's own upload of the same bytes gets a
new id, and A cannot attach the stray blob either. There is no Canvas
request, no row, and both of A's blobs remain. Unauthenticated uploads get
401. A then submits the proper upload, and it is freed after Canvas confirms.

### Credential invalidation (reworked in the P2 round)

`canvasCredentials.revision` is bumped on every `save`, but `disconnect`
deletes the row, so a new connect starts again at revision 1. Comparing the
number alone therefore had an ABA race. The identity is now the row id plus
the revision (`CredentialIdentity`). Convex never reuses a document id.

- `getCanvasClient` returns `session.identity`
  (`{ credentialId, revision }`, not secret).
- `credentials.markInvalid({ userId, credential })` requires it and returns
  whether it marked. Unless that exact row and revision are still stored, it
  changes nothing: the status and the tripwire schedule are left alone.
- Every caller passes the identity it acquired: submission `send`, sync's
  `tripwireUser` and `fullSyncUser` (through `handleSyncError`), the preview
  control, and task02's `sync-schedule` test. No other caller exists.
- In submissions, a 401 for a replaced credential retries with the current
  one. In sync, it rethrows so the Workpool retries with the current token,
  without setting an error status. A 401 for the current credential still
  invalidates it, removes the schedule, and fails the row with "reconnect".

Regressions (slow transport):
- A submission check with the old row's token is held; the student
  disconnects and connects again (new row, revision 1 again); the held
  request gets 401. The new row stays active and scheduled, and the
  submission goes through.
- The same race for a held tripwire request. The new credential and
  schedule stay; a 401 on the next tripwire, from the current credential,
  invalidates it and removes the schedule.
- The earlier reconnect-without-delete race still passes.

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
| 401 for the current credential (row and revision) | `markInvalid`, then as above |
| 401 for a credential a reconnect or disconnect replaced | retry with the current one; nothing invalidated |
| reconnect-required after a possible send | "Not confirmed yet" with reconnect |

## Interfaces

- Upload with `POST /submissions/upload` (bearer Convex token, file body) →
  `{ storageId }`, then
  `submissions.submit({ clientKey, assignmentCanvasId, content, confirmed: true })`.
  `generateUploadUrl` and `registerUpload` no longer exist.
- `submissions.resume({ id })`: "Try now" for a queued row (refused while a
  send may have landed), or one check for an unconfirmed row. Never sends.
- `submissions.sendAgain({ id, confirmed: true })`: failed or unconfirmed
  rows only.
- `credentials.markInvalid({ userId, credential: { credentialId, revision } })`
  returns `boolean`; `credential` is required. `CanvasSession.identity` and
  the exported `credentialIdentity` / `CredentialIdentity` are new.
- `syncStore.claimCanvasLease` / `releaseCanvasLease` / `LEASE_STALE_MS`;
  `claimSync` and `releaseSync` keep their contracts.
- Schema: `canvasCredentials.revision`, `submissionOutbox.canvasLease`, new
  `submissionUploads` table (`userId`, `storageId`, `expiresAt`,
  `outboxId`; indexes `by_user`, `by_storage`); `outboxErrorKind` drops
  `notReceived`.
- New client env use: `VITE_CONVEX_SITE_URL`, which the ICS feed already
  needs. No new dependency; `@noble/hashes` is no longer imported by the
  panel.

## Checks

On `eed2c6e` (the P2 fix; this doc adds no code):

| Check | Result |
| --- | --- |
| `bun run typecheck` (app, convex, tests) | passed |
| `bun run lint` | passed |
| `bun run test` | passed: 36 files, 295 tests; 12 full runs after the wait fix, the last 5 on the final test code |
| `tests/submissions.test.ts` | 18 passed, including the ABA (submission and sync) and upload provenance regressions |
| `tests/sync-schedule.test.ts` | passed with the identity-carrying `markInvalid` call |
| `tests/submission-panel.test.tsx` | 3 passed (upload hook mocked) |
| reverting fixes | with `markInvalid` comparing revision only, both ABA tests fail; with `submit` skipping the owner check, the provenance test fails |
| preview API smoke (mock) | the preview's upload runs the real HTTP action as the preview student, then one submit (upload host sent no token) |
| `convex codegen` | not run; `_generated/api.d.ts` still hand-edited (no new modules this round) |
| production build, `tests/browser`, UI or CUA pass | not run (UI verification belongs to the coordinator) |

One flaky wait was found and fixed. Under full-suite load, the lease test
gave the other user's submission a fixed 10 event-loop turns, and its real
Web Crypto decrypt could take longer; it failed in 1 of about 6 full runs.
It now waits for the condition, yielding real time without moving the fake
clock. Two other waits in that test were tightened to wait for the busy
claim itself.

Detailed execution evidence (commands, outputs, logs) is outside the repo:
`/home/srinivasib/.local/state/wiscourse-evidence/task03-p2/`.

## Mock versus real evidence

Everything ran against the mock Canvas; nothing was sent to a real Canvas.
Unverified on real Canvas: UW's upload replies (inst-fs 201 versus a 3xx
confirmation), `redirect: "manual"` in the Convex runtime, the shape and
timing of `submission_history`, how Canvas rewrites text bodies, and its
error bodies for locked or over-attempt assignments. Unverified on a real
Convex deployment: the upload HTTP action with a real Clerk token and CORS
preflight from the app origin, the exact HTTP body limit, scheduler timing,
and concurrent actions under the lease. The Mac fixture
`wiscourse-p1-reproduction.cjs` concerns task02's auth provider and was not
run here.

## Preview

`http://100.84.133.110:46867/` (Tailscale only, preview id
`fb1bac03247abbb15998`), serving this worktree with the mock backend and
mock Canvas. It now includes "Reply lost, Canvas slow to show it" and the
check-only behaviour; the browser pass is the coordinator's.

## Remaining limits

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
- Upload and record happen in one HTTP request, but not one transaction.
  If the action dies between `store` and `recordUpload`, the blob has no
  owner record and nothing deletes it. Nobody can attach it either.
- Any signed-in user can store up to 20 MB per request, with no rate limit;
  unattached files are deleted only on that user's next upload after a day.
- A stale-credential 401 in sync throws a plain error so the Workpool
  retries; a job with no retries left ends without an error status, and the
  next tripwire recovers.
- Files are held in action memory one at a time, capped at 20 MB.

## Draft PR body (not opened; waiting for coordinator CUA and review)

Title: Assignment submissions through a confirmed, durable outbox

> Roadmap M6: submit text, URLs and files to Canvas from the assignment
> view. Stacked on the task02 branch (`CanvasReconnectRequired`, drafts,
> retained-client fix).
>
> **Flow**
> - Compose, review in a confirmation dialog, submit. Files go to Convex
>   storage first through an authenticated upload endpoint that records the
>   uploader; a scheduled action delivers the outbox row.
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
>   Settings. A late 401 for a replaced credential (row id plus revision,
>   also across disconnect and reconnect) does not invalidate the new one,
>   in submissions or sync.
>
> **Testing**: typecheck, lint, 295 tests including 21 for submissions
> against a mock Canvas. A mock-only preview (`tests/submission-preview`)
> covers each scenario. Nothing has been sent to a real Canvas.
>
> **Before merge**: run `convex codegen` (api.d.ts edited by hand). No data
> migration; `allowedExtensions` fills in on the next full sync. Set
> `VITE_CONVEX_SITE_URL` in the frontend (already needed for ICS).
