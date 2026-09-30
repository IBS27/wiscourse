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
| `e0cc6d2` | docs: P2 round (reviewed head for the upload-owner round) |
| `3199abe` | fix(submissions): bind file uploads to the confirming owner |
| `58a53cd` | docs: upload-owner round (published PR #12 head, reviewed by Astra) |
| `1094b7c` | fix(submissions): receipt timestamps, confirmed conflict replacement, upload throttling |
| `c64a7bd` | merge of the #11 auth candidate `edc2d63` (no rebase) |
| `0271301` | test(auth): owner lifetime through a Clerk gap, switch and logout |
| `7018a98` | docs: PR #12 review round (candidate sent for recheck) |
| `ee6ccc4` | merge of the final #11 candidate `4c9361c` (acknowledged-save drafts) |
| `04e9506` | test: acknowledged draft saves and unsent submissions in one TodoDetail |
| (this doc) | docs: #11 final merge |

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

### PR #12 review round (Astra F2-F4, Bugbot r4149582119)

Review: `/tmp/pr-babysit-20260930/reviews/wiscourse-12/review.md` at
`58a53cd`. F1 (#11's retained-client auth) was fixed by the #11 owner at
`edc2d63`, which is merged here.

- F2, receipt time. When a lost send is found in Canvas's history,
  `canvasSubmittedAt` is now that attempt's own `submitted_at`, not the
  latest attempt's. The assignment mirror still takes Canvas's latest
  submission, so a later attempt's time, grade and posting state are not
  rolled back. (Bugbot's suggestion to mirror the historical attempt is not
  taken, for that reason.)
- F3, conflict resend. A conflict records Canvas's latest attempt
  (`conflictAttempt`). A confirmed Send again sets `replaceConfirmed`. The
  next attempt:
  1. looks for this payload first; a late delivery is confirmed without
     sending;
  2. sends only if Canvas's latest attempt is still the recorded one,
     advancing the baseline to it once;
  3. treats anything newer as a new conflict that needs a new confirmation.
  "Check Canvas again" and automatic retries never replace. The dialog now
  says that a conflict resend makes a new attempt.
- F4, upload throttling. The multipart upload host's 429 and 403 "Rate
  Limit Exceeded" now throw `CanvasRateLimitError`, which the outbox
  retries. A plain 403 stays terminal, no token goes to the upload host, and
  an upload-host error never marks the Canvas credential invalid.

Evidence:
- The new tests in `tests/submissions.test.ts` failed on `58a53cd` for the
  reviewed reasons, all 5: the receipt, the confirmed replacement, and the
  403 and 429 upload throttles. They pass now.
- The late-delivery and moved-on test, and the permission-403 test, guard
  the fix and pass both before and after.
- The reviewer's own repro file, run against the fix, now fails every
  defect assertion (4 of 4).

Merge. The only conflict was `auth-provider.tsx`: `OwnerSession` wraps
#11's `BackendSession`, which is now keyed by `sessionKey`. During a Clerk
gap #11 keeps the owner, so the upload lifetime survives. The upload guard
sees no live Clerk user during a gap, so it refuses to upload or submit
(fail closed while the UI is hidden). `tests/owner-lifetime-auth.test.tsx`
runs the real provider: the lifetime survives a gap, and aborts on another
account or a resolved logout.

### Final #11 merge (`4c9361c`)

`1ab754a` retires a saved title/notes edit when its save is acknowledged,
even while an auth remount hides the view, and keeps newer typing on top. It
auto-merged. Its `todo-detail.tsx` changes (a promise-returning save, and
`useSourcedDraft`'s `save`) are in different hunks from the submission panel
mount. The previous auth resolution is unchanged: `OwnerSession` around the
`sessionKey`-keyed `BackendSession`, exported `belongsToUser`.

`tests/todo-detail-submission-drafts.test.tsx` renders an assignment's real
TodoDetail, so both features are on screen. Across a hidden remount, the
notes save is acknowledged and the server moves back to the old value. The
saved edit is not revived or re-saved, the unsent submission text survives,
and nothing is submitted without confirmation. A new owner's store starts
empty. With the pre-merge drafts code, the test fails because the saved
"AB" comes back.

On `04e9506`: typecheck and lint pass. The combined auth, draft, owner and
submission set passes (11 files, 102 tests; the new test is also green on
its own). The full suite passes (40 files, 329 tests). No build this round.
Evidence: `/home/srinivasib/.local/state/wiscourse-evidence/pr12-merge-4c93/`.

### Upload owner binding on the client (upload-owner round)

Review of `e0cc6d2` (a static finding, not reproduced at runtime): the
upload hook called Clerk's global `getToken` and posted the file without
checking whose token came back. Clerk can report the next account before
React disposes the old one (`auth-recovery.ts` already says so), so a
pending token request, or a multi-file loop still running, could upload A's
bytes with B's token into B-owned storage. Closing A's Convex client stops
only the later `submit`, not the HTTP upload.

- `OwnerSession` (`src/lib/owner-session.ts`) wraps each owner's
  `UserSession` subtree, which the provider keys by owner. It holds an
  `AbortSignal` that aborts when that owner's session is disposed. Same-owner
  recovery remounts `BackendSession` below it and leaves the signal alone. A
  new session for the same account gets a new signal, so work from the old
  one stays dead.
- `useOwnerBoundUploads()` (replacing `useSubmissionUpload`) starts one run
  per confirmation and captures the owner and signal at that point. For each
  file it:
  1. checks that the signal is live and that Clerk's live user is still the
     owner;
  2. waits for the token but gives up on disposal, ignoring a late result;
  3. checks again, and refuses a token whose `sub` is not the owner (the
     existing `belongsToUser` continuity check, now exported);
  4. posts with the signal, so disposal aborts the request in flight;
  5. checks again before accepting the result.
  Any failure throws and stops the remaining files.
- The dialog calls `run.ensureCurrent()` before `submit` and before
  `sendAgain`, so a text or URL submission is checked too.
- Server authentication and the upload ownership registry are unchanged.
  The client check only decides whether to send; Convex still verifies the
  token and records its subject.

Regressions (`tests/submission-upload.test.tsx`) use the real hook,
`OwnerSession` and panel, with Clerk, `fetch` and Convex mocked:
- A's token request is held, A is disposed for B, and the request resolves
  with B's token: zero uploads and no submit, even after A signs back in.
- A leaves and returns, and the old request resolves with A's own token:
  still zero uploads. Only disposal can stop this one.
- Clerk reports B while A's panel is still mounted: B's token is refused,
  nothing is uploaded, and a retry is refused too.
- Three files, with A disposed during the first upload: that request's
  signal aborts, a late reply is ignored, and there is no second file and no
  submit.
- Same owner with re-renders: both files go up with A's token to
  `/submissions/upload`, then one submit.
- Text submission: `submit` is refused while Clerk reports B, and allowed
  once A is current again.

Removing each guard fails at least one of these tests:
- the token-subject and Clerk checks: 2 tests;
- disposal aborting the signal: 2;
- the signal passed to `fetch`: 1;
- the check before `submit`: 1.

The mock preview still replaces this hook (it has no Clerk), and so does the
panel unit test. The owner binding is covered by the test above.

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
- Client: `useOwnerBoundUploads(): () => OwnerRun` (`{ upload(file),
  ensureCurrent() }`) replaces `useSubmissionUpload`. `OwnerSession`,
  `OwnerSessionContext`, `OwnerLifetime` and `useOwnerLifetime` are new in
  `src/lib/owner-session.ts`, and `belongsToUser` is exported from
  `auth-recovery.ts`. `auth-provider.tsx` only adds the `OwnerSession`
  wrapper; the token fetcher and owner derivation from task02 are unchanged.
  No backend interface changed in this round.

## Checks

On `0271301` (candidate code; this doc adds none):

| Check | Result |
| --- | --- |
| `bun run typecheck` | passed |
| `bun run lint` | passed |
| focused: auth-transport, auth-recovery, drafts, todo-detail-drafts, profile-menu-auth, submission-upload, submission-panel, submissions, sync-schedule, connection-health | 10 files, 94 tests passed (before the new auth test) |
| `bun run test` | 39 files, 322 tests, 2 runs |
| `bun run build` | passed |
| codegen | not rerun. A prior exact-head dry run at `58a53cd` exited 0 with generated files unchanged (`/home/srinivasib/.local/state/wiscourse-evidence/codegen-dry-run-20260930/results.json`); that supersedes the earlier blocker note. This round adds no Convex module, and `dataModel.d.ts` derives from the schema by type. |
| UI or CUA | not run (coordinator) |

Evidence for this round is in
`/home/srinivasib/.local/state/wiscourse-evidence/pr12-review-fixes/`.
Earlier rounds are in `task03-p2/` and `task03-upload-owner/`.

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
- The client owner check reads Clerk's live `user` and the token's `sub`
  (continuity, not signature verification). It is verified only against a
  Clerk mock; real Clerk multi-session switching is unverified. An upload
  already accepted by the server before disposal stays recorded for its
  owner (A's own storage) and expires unattached.
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
>   uploader. The client binds each upload to the confirming account and
>   stops, aborting any request in flight, if that account's session ends.
>   A scheduled action delivers the outbox row.
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
> **Testing**: typecheck, lint, build, 301 tests including 27 for submissions
> against a mock Canvas. A mock-only preview (`tests/submission-preview`)
> covers each scenario. Nothing has been sent to a real Canvas.
>
> **Before merge**: run `convex codegen` (api.d.ts edited by hand). No data
> migration; `allowedExtensions` fills in on the next full sync. Set
> `VITE_CONVEX_SITE_URL` in the frontend (already needed for ICS).
