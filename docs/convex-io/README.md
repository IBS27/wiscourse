# Convex I/O implementation and rollout

Implemented on `perf/convex-io`, based on clean `main` at `f6523ed`, on Fedora
in `/home/srinivasib/Developer/wiscourse-io`. The original checkout is unchanged.
No backend deployment, frontend server restart, production build, billing change,
or live migration has been performed. Local code generation contacted Convex for
component analysis; it did not publish the functions.

## Measurements

The inventory was captured on September 12, 2026. `dev-inventory-before.json`
and `prod-inventory-before.json` record deployment URLs, timestamps, API-contract
hashes, and record sizes. The hash identifies a function specification, not the
deployed source revision. An exact deployed git revision was not available.

| Deployment | URL | Assignments | Courses | Discussions | Quizzes |
| --- | --- | ---: | ---: | ---: | ---: |
| Development | https://standing-warthog-759.convex.cloud | 899 | 32 | 56 | 32 |
| Production | https://brave-swordfish-418.convex.cloud | 899 | 32 | 56 | 32 |

Both deployments allowed read-only administrative queries. That alone does not
establish whether every public application function is enabled. No deployment
was re-enabled as part of this work.

The initial usage snapshots, captured before the full inventories, reported:

| Deployment | Current-day database I/O, GB | Current-month database I/O, GB | Day calls | Month calls |
| --- | ---: | ---: | ---: | ---: |
| Development | 0.147670 | 2.451899 | 3,989 | 102,349 |
| Production | 0.009188 | 0.438330 | 1,443 | 18,906 |

These are cumulative deployment totals from the CLI, not function-level
comparisons. Inventory queries themselves consume reads. Function-level live
read/write bytes, execution counts, and latency still need a controlled release
comparison using Convex metrics. The September 11 team total is a separate period.

### Repeatable workload

`tests/io-observed.test.ts` uses the observed record counts, course membership,
visibility, relative dates, description lengths, and comment lengths. Titles,
URLs, bodies, comments, identities, IDs, and scores are synthetic. The fixture
does not contain source text or credentials. It is a structural approximation,
not a reproduction of live users' activity.

The same test was run on an isolated original checkout at `f6523ed` and on the
new branch. It invokes each list once at initial load, after an unchanged sync,
after one genuine update, after marking an item seen, after completing a todo,
and after navigation. It also measures the corresponding assignment mutations.
Each list therefore has six deliberate executions. Automatic subscription
invalidation, client deduplication, and cache hits are not simulated or counted
as measured live savings.

`convex-test` supplies transaction read/write bytes, documents, and query counts.
These are emulator metrics, not billing measurements. Inventory sizes use UTF-8
JSON bytes, which are a different measurement again.

| Operation, observed-shape fixture | Original read bytes | Compact read bytes | Reduction |
| --- | ---: | ---: | ---: |
| Initial `inbox.feed` | 178,195 | 15,363 | 91.4% |
| Initial `todos.list` | 86,957 | 50,513 | 41.9% |
| Both lists | 265,152 | 65,876 | 75.2% |
| Unchanged assignment batch | 35,738 | 13,451 | 62.4% |

That unchanged batch contains three assignments. Its writes fell from three
documents / 11,655 bytes to zero. Search and compact projections also made zero
writes. Successful sync status advances independently.

All twelve list-output digests match the original checkout after normalizing the
intended 320-character announcement preview and test-generated todo IDs. Ordering,
seen state, completion, visibility, dates, and grade output are otherwise compared
unchanged. The test asserts these digests on subsequent runs.

The larger `tests/io-workload.test.ts` fixture has three courses, 300 assignments,
30 announcements, and three quizzes with large bodies and comments. Its initial
inbox reads fell from 7,040,211 to about 36,000 bytes, and todo reads from 2,201,895
to about 34,000 bytes. Replaying 100 assignments fell from 100 writes / 2,137,360
bytes to zero writes. This stress case must not be presented as typical usage.

Local observed-fixture median query times across six executions were about
11.1 ms to 3.9 ms for inbox and 3.9 ms to 4.2 ms for todos. These include test
runtime overhead and are not production latency evidence. User/date indexes
reduced inbox database query calls from 22 to 10; todo calls changed from five
to six due to the reader-mode lookup. Per-course fan-out was removed after it
read the same eligible rows with many more index calls on this fixture.

The simulated migration began without compact records. Backfill plus both
verification passes took 214 bounded executions, read 5,285,415 bytes and wrote
430,857 bytes, including checkpoint writes. The final reader-switch transaction
is excluded from those totals. Actual migration usage and storage must be recorded
separately during rollout.

### Reproduction

From this worktree, with dependencies installed using Bun:

```sh
bun run test tests/io-workload.test.ts tests/io-observed.test.ts
IO_COMPACT=true IO_REPORT=/tmp/observed-compact.json bun run test tests/io-observed.test.ts
IO_COMPACT=true IO_REPORT=/tmp/stress-compact.json bun run test tests/io-workload.test.ts
```

To reproduce the original observed-shape baseline, use an isolated checkout at
`f6523ed`, copy `tests/io-observed.test.ts`, `tests/list-migration.ts`,
`docs/convex-io/dev-inventory-before.json`, and `docs/convex-io/observed-baseline.json`
into it, install the pinned dependencies, and run:

```sh
IO_BASELINE=true IO_REPORT=/tmp/observed-baseline.json bun run test tests/io-observed.test.ts
```

The migration helper is dynamically loaded only for a compact run. Do not turn
on `IO_COMPACT` against the original checkout. Keep the frozen inventory when
comparing versions; taking another inventory changes the fixture's relative dates.

To collect another read-only deployment inventory from a configured checkout:

```sh
python3 scripts/convex-io-snapshot.py --deployment dev --output /tmp/dev-inventory.json
python3 scripts/convex-io-snapshot.py --deployment prod --output /tmp/prod-inventory.json
```

## Changes and behavior contracts

- Generic sync upserts compare every normalized persisted source field. They
  patch only changed records and reuse the existing assignment read for change
  logging and automatic todo completion. Search projections reconcile on replay
  so course reactivation can restore previously pruned entries.
- Optional source fields omitted from a snapshot are cleared, including due
  dates and points. Locally verified instructors are preserved. A missing
  submission object preserves the existing submission; a supplied submission
  replaces its grade/status fields. Omitted comments are preserved, while `[]`
  clears them. Page metadata without a body preserves existing content; explicit
  locked/unavailable responses clear it. Tests cover these distinctions.
- `syncedAt` now records the last persisted source change. The sync-status UI
  already uses `syncState`. Page summaries still expose `syncedAt`, but there is
  no UI consumer treating it as freshness. ICS uses it as an event modification
  timestamp, which now stays stable across unchanged syncs.
- Four compact tables exclude assignment/quiz descriptions, submission comments,
  discussion HTML, course syllabus HTML, and sync timestamps. Original tables
  remain authoritative and continue to serve full details. Details gain no extra
  client request or join in this implementation. Course-list IDs remain source IDs.
- Writers update projections atomically, including roster enrichment, submission
  updates, and pruning. Description/comment/syllabus-only changes do not rewrite
  compact records. Course removal hides retained child history as before.
- Inbox uses indexed creation/posted-date paths, plus targeted lookups for older
  assignments with recent change notifications. Mark-all-seen uses the same
  eligibility rules. Announcements store a bounded preview; full HTML is available
  in the existing detail query. Grade privacy and regrade versions are unchanged.
- Lists stay complete within their existing eligibility rules. Planned and
  annotated items outside the window, personal tasks, and quiz/discussion
  deduplication remain. User/date indexes narrow records before course visibility
  is applied; no additional per-course query fan-out or maintained counts are used.
- All inbox/todo subscribers share a minute-aligned clock argument. It advances
  window membership without source writes and catches up on focus/visibility
  changes. Calendar callers retain their explicit date range. Badge bucketing
  remains client-side with the display timezone. Older clients without the new
  clock remain API-compatible, but must reload the new frontend to get timed
  refresh. Coordinate frontend rollout with backend rollout.
- The clock pauses notifications in hidden tabs and catches up when shown.
  Real database updates remain subscribed. It can cause up to 60 executions per
  mounted query per visible hour before
  caching. At the observed fixture sizes, continuously keeping both subscriptions
  open adds about 3.95 MB/hour of database reads from clock refreshes alone.
  Include this cost, foreground duration, and open tabs in live comparisons.
- `WISCOURSE_BACKGROUND_SYNC=false` disables cron dispatch before credential
  reads or job creation. Manual sync still enqueues normally. Unset or `true`
  preserves the production cadence. This release has not changed that setting
  on either deployment. Already queued jobs still finish; drain them before
  measuring a controlled manual-only workload.

## Rollout and rollback

1. Finish browser verification against this worktree and its development backend.
   No connected browser was available during implementation, and the existing
   frontend servers serve `main`. Starting/restarting a frontend requires the
   user's authorization under the supplied plan. No production build is needed
   for local checking.
2. Check the backend owner and existing processes again. Use one deployment
   process from this worktree. Deploy schema, indexes, compatible writers, and
   optional clock arguments to development first. Coordinate the frontend update
   so open clients get the shared clock. The compact reader switch defaults off.
3. During controlled development migration, deliberately set background sync to
   `false` and use manual sync. Record the setting and restore the prior setting
   before representative observation. Keep production cadence unchanged. Do not
   count savings from disabled scheduling as query improvements.
4. Invoke `listMigration:advance` repeatedly for each of `courses`, `assignments`,
   `quizzes`, and `discussions` until each returns `stage: "ready"`. Each call
   resumes the stored checkpoint. Backfill and forward verification use at most
   25 documents / a 512 KiB read target; reverse verification uses at most eight
   summaries, bounding the possible full-document joins. One large document can
   exceed the byte target, so row bounds provide additional headroom.
5. Both verification passes fail on missing, stale, or orphaned projections.
   Fix the divergence and rerun from the checkpoint. Each mutation reads current
   source data transactionally; an intervening sync or deletion cannot be
   overwritten by a stale external snapshot.
6. Compare identical queries, including a real update, seen transitions, regrades,
   and deletion, then enable compact readers. `setReaderMode` rejects enabling
   until all four tables have passed verification. Preserve the compatible
   writers and original data during observation.
7. Capture a controlled workload and 24–48 hours including a nightly sync before
   promoting to production. Record deployment, release commit, interval, settings,
   active-user/tab duration, executions, read/write bytes, and p50/p95 latency.
   Repeat the migration and gates separately in production.

Examples for the explicitly selected development deployment, after deploying:

```sh
CONVEX_DEPLOYMENT=dev:standing-warthog-759 bun node_modules/convex/bin/main.js run listMigration:advance '{"table":"assignments"}' --codegen disable
CONVEX_DEPLOYMENT=dev:standing-warthog-759 bun node_modules/convex/bin/main.js run listMigration:setReaderMode '{"compact":true}' --codegen disable
```

Rollback switches readers only:

```sh
CONVEX_DEPLOYMENT=dev:standing-warthog-759 bun node_modules/convex/bin/main.js run listMigration:setReaderMode '{"compact":false}' --codegen disable
```

Do not deploy the old writers while leaving compact readers enabled. Do not
delete migrated records or original large fields during this rollout. A later
cleanup can consolidate storage after rollback is no longer needed.

## Remaining gates

Local checks cover replay writes, real changes, optional-field clearing, partial
comments/pages, sync success, full-sync pruning, independent seen state, regrades,
posted-grade privacy, course visibility, retained plans and annotations, personal
tasks, migration interruption/repair/rollback, large details, shared subscriptions,
midnight, timezone changes, tab resume, and disabled cron versus manual sync.

Browser verification, backend deployment validation, live migration, function-level
live metrics, and the 24–48 hour observation period remain pending. The implementation
has not yet met the plan's live completion criteria. Pagination and dedicated count
queries are deferred until those measurements justify their added behavior and
consistency work. Trackspace, Drft, and Pixel were not changed.
