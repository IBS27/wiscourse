# Submission preview (mock only)

Run `bunx vite --config tests/submission-preview/vite.config.ts` and open its URL.
The page renders the real assignment view and submission panel. Queries and
mutations run the real Convex functions on convex-test inside the Vite server,
and `fetch` in that process is the fake Canvas from
`tests/helpers/mock-canvas.ts`, which refuses every other host. No account,
Canvas token or Convex deployment is involved. The app's Vite config does not
include any of this.

The left panel queues Canvas faults for the next requests (rate limits, 503s,
lost replies, refusals, a revoked token, a delivery job that dies), toggles the
credential, and shows Canvas's own attempts, the outbox rows and every Canvas
request. "Canvas attempts" is the ground truth for duplicates.

Retries run on real time: 30 s, 2 min, 8 min, and at least 90 s before checking
a send whose reply was lost. "Try now" skips a wait unless the send may have
landed. "Expire lease" does what the 11-minute watchdog does.
