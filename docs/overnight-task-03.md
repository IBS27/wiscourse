# Overnight task 03: assignment submissions

Fedora, worktree `/home/srinivasib/.t3/worktrees/wiscourse/t3code-43429b90`,
branch `t3code/assignment-submission-workflow`. Nothing is pushed, merged or
deployed. No Convex backend was pushed, no Canvas request was made, and no
credential, grant or key was created. Every submission in this work went to
the mock Canvas at `canvas.mock.invalid`.

## Commits

Base is `t3code/auth-session-adaptive-sync` at
`70ecd513a6f78cd53e15341223704b34310e006d` (task 02).

| Commit | What |
| --- | --- |
| `f8fe8f0` | feat(submissions): outbox, delivery, panel, mock Canvas, preview |
| (this doc) | docs: this report |

## What it does

The assignment view gets a submission panel for assignments whose Canvas
`submission_types` include text entry, URL or upload. Other online types
(media, annotation, LTI, quizzes, discussions) say to submit in Canvas.

1. The student writes text, pastes a URL or picks files, then presses
   **Review submission**. Invalid input (empty text, a non-http URL, a file
   type Canvas does not allow, over 10 files or 20 MB) is caught here.
2. A dialog shows exactly what will be sent, a late notice past the due
   date, and a new-attempt notice if Canvas already has a submission.
   Nothing is sent until **Submit to Canvas**. Files upload to Convex
   storage at this point, so delivery does not depend on the tab.
3. `submissions.submit` stores one `submissionOutbox` row and schedules
   `submissions.send`. The panel shows the row: queued, checking, uploading
   (n of m), sending, waiting to retry, confirmed (with Canvas's attempt
   number), failed, or not confirmed yet.
4. On confirmation the assignment mirror takes Canvas's returned submission
   (so the status box says "Submitted" and the todo is done on submission)
   and the stored files are deleted.

### Duplicate protection

- The dialog makes a client key. Submitting the same key again returns the
  same row, so a double click or a replay after reconnect queues once.
- One open row (queued, sending or unconfirmed) per assignment. A new
  submission is refused until the last one is confirmed, failed or
  dismissed.
- `claim` numbers each attempt and arms an 11-minute watchdog (Convex kills
  actions at 10). A stale action or watchdog with an older number changes
  nothing.
- Canvas has no idempotency key, so every attempt first reads
  `submissions/self` with history. The first read records Canvas's attempt
  number; later attempts look for a newer attempt whose content matches
  (visible text, normalised URL, or our uploaded file ids). A match marks
  the row confirmed without sending. A newer attempt that is not ours ends
  the row "unconfirmed" as a conflict.
- `mayHavePosted` is set before the POST and cleared only when a check finds
  nothing. While it is set, a failure never becomes "failed": the row
  retries with a check, and ends "unconfirmed" if Canvas cannot be read.
  "Check Canvas again" only checks; if Canvas has nothing, the row becomes
  failed ("Canvas did not receive it") and **Try again…** sends again
  through a second confirmation.
- A lost send waits at least 90 s before its check so a slow Canvas write
  is not mistaken for a missing one; "Try now" is refused in that state.

### Retries and errors

| Error | Result |
| --- | --- |
| 403 "Rate Limit Exceeded", 429 | retry (check first if a send may have landed) |
| 5xx, network error, timeout before the POST | retry at 30 s, 2 min, 8 min; 4 tries, then failed |
| 5xx, network error, timeout on the POST | check after at least 90 s; unconfirmed if checks run out |
| other 4xx on the POST, or before any possible send | failed, Canvas's message shown, no retry |
| `CanvasReconnectRequired` (missing or invalid credential) | failed with reconnect, no retry, no Canvas request |
| `CanvasAuthError` (401 unauthenticated) | `credentials.markInvalid`, then as above |
| either of the last two after a possible send | unconfirmed with reconnect |

Retry and check buttons are replaced by "Reconnect in Settings" while the
credential is not active, and `submit` and `resume` refuse on the server too.

## Files

- `convex/submissions.ts`: queries, mutations, the delivery action, watchdog.
- `convex/lib/submissions.ts`: rules shared with the UI (accepted kinds,
  locks, extensions, text to HTML, delivery matching, retry delays).
- `convex/canvas/client.ts`: `post` (form-encoded, optional timeout) and
  `uploadFile` (bytes to the upload URL without the token, confirmation
  only on the Canvas host). `CanvasApiError` keeps the response body.
- `convex/schema.ts`: `submissionOutbox` table; `assignments.allowedExtensions`
  (synced from Canvas, left out of the list summaries).
- `convex/syncStore.ts`: `applySubmissionUpdate` extracted from
  `applySubmissionUpdates` so the outbox writes the mirror the same way.
- `convex/credentials.ts`: `credentialState` (status only, no token material).
- `src/components/todo/submission-panel.tsx`, mounted in `todo-detail.tsx`.
- `tests/helpers/mock-canvas.ts`: the fake Canvas used by tests and preview.
- `tests/submission-preview/`: the mock-only preview.

`convex/_generated/api.d.ts` was edited by hand for the two new modules.
Run `convex codegen` before merge and confirm it produces no diff.

## Checks

On `f8fe8f0`:

| Check | Result |
| --- | --- |
| `bun run typecheck` (app, convex, tests) | passed |
| `bun run lint` | passed |
| `bun run test` | passed: 36 files, 286 tests (270 before) |
| `tests/submissions.test.ts` (13) | confirm once/deliver once, validation, throttling and outages, lost reply found by check, lost send resent once, early-retry refusal, unconfirmed then check, not received then resend, reconnect without retry, token dying mid-check, watchdog recovery ignoring the dead action, uploads without token and storage freed, redirected upload confirmation |
| `tests/submission-panel.test.tsx` (3) | nothing sent without confirmation and the same key reused after an error; unconfirmed offers only a check; reconnect replaces retry |
| `convex codegen` | not run (contacts the deployment) |
| production build, `tests/browser` harness | not run |

### Mock versus real evidence

Everything above ran against the mock Canvas. Nothing has been sent to a
real Canvas, and nothing should be until a deliberate, user-approved test
against a sandbox or a throwaway assignment. Unverified on real Canvas:

- UW's exact responses for the upload flow (inst-fs 201 with JSON versus
  a 3xx confirmation); both are handled and tested against the mock.
- `redirect: "manual"` in the Convex runtime returning the 3xx itself.
- The shape of `submission_history`, and whether Canvas rewrites text
  bodies beyond what `visibleText` normalises. A mismatch would make a
  delivered text submission look like a conflict ("unconfirmed"), not a
  duplicate.
- Canvas error bodies for locked, closed or over-attempt assignments.

### Preview

`http://100.84.133.110:46867/` (Tailscale only, preview id
`fb1bac03247abbb15998`, started with the remote-preview skill). Mock only:
real UI and Convex functions on convex-test inside the Vite dev server,
fake Canvas, no Clerk, no Convex deployment. See
`tests/submission-preview/README.md`.

Checked on Fedora in a browser tab: the page renders; the text flow with
"Reply lost, Canvas saved it" showed the dialog, waited to check, then
"Canvas confirmed attempt 1" with one POST in the log and one Canvas
attempt; the file flow rejected a `.txt` before review, retried a 503 from
the upload host after "Try now", confirmed with no token sent to the
upload host. This found and fixed one bug: `crypto.randomUUID` is missing
on non-HTTPS origins, which broke **Review submission** there. Laptop
reachability and the remaining scenarios are for the coordinator's CUA.
State was reset afterwards.

## Risks

- Content matching after a lost reply can misjudge text if Canvas
  sanitises it differently; the failure mode is "unconfirmed" plus a
  check, never an automatic second send.
- If the student submits the same assignment in Canvas while a row is
  queued, the check may count that attempt as ours (same type and content)
  or flag a conflict. Either way nothing is sent twice.
- A POST that takes Canvas more than 90 s to commit after our timeout could
  be missed by the check and resent. Canvas's own request timeout makes
  this unlikely; the delay is `CHECK_DELAY_MS`.
- `generateUploadUrl` lets any signed-in user store blobs; `submit` checks
  size and extension but not who uploaded a storage id. Storage ids are
  unguessable, and the only effect is submitting that blob to one's own
  assignment. A crash between upload and `submit` leaves an orphan blob.
- Files are held in action memory one at a time; the 20 MB cap is below
  the 64 MB action limit. Larger files are sent to Canvas.
- A dead action leaves the row "sending" for up to 11 minutes before the
  watchdog moves it on.
- Rollout: the schema adds a table and an optional field; no migration.
  `allowedExtensions` fills in on the next full sync; until then any file
  type passes the client check and Canvas decides.

## Draft PR body (not opened; waiting for coordinator CUA and review)

Title: Assignment submissions through a confirmed, durable outbox

> Roadmap M6: submit text, URLs and files to Canvas from the assignment
> view. Builds on #(task 02 PR) for `CanvasReconnectRequired` and drafts.
>
> **Flow**
> - Compose, review in a confirmation dialog, submit. Files go to Convex
>   storage first; a scheduled action delivers the outbox row.
> - The panel shows queued, checking, uploading, sending, waiting to
>   retry, confirmed (Canvas's attempt number), failed and not confirmed.
>   Nothing is marked submitted until Canvas confirms.
>
> **No duplicates**
> - Client key per confirmation; one open submission per assignment;
>   numbered attempts with an 11-minute watchdog.
> - Every attempt reads Canvas's submission history first. A send that
>   may have landed is checked, not repeated; if Canvas cannot be read the
>   row is "not confirmed yet" and only offers a check.
>
> **Errors**
> - Throttling, outages and lost replies retry at 30 s, 2 min, 8 min.
> - Refusals are final and show Canvas's message.
> - A missing or rejected credential stops without retry and points to
>   Settings.
>
> **Testing**: typecheck, lint, 286 tests including 16 new against a mock
> Canvas. A mock-only preview (`tests/submission-preview`) exercises every
> scenario. Nothing has been sent to a real Canvas.
>
> **Before merge**: run `convex codegen` (api.d.ts edited by hand). No data
> migration; `allowedExtensions` fills in on the next full sync.
