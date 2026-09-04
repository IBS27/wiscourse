# wiscourse

A fast, reliable replacement UI for Canvas at UW–Madison. The app syncs
Canvas data into Convex in the background and the UI reads only from
Convex, so every screen loads instantly and updates live.

## Stack

- **Frontend**: React + Vite + TanStack Router (file-based routes) +
  Tailwind v4 + shadcn/ui
- **Backend + database**: Convex (sync jobs, live queries, crons, Workpool)
- **Auth**: Clerk for app sign-in; Canvas is a linked data connection,
  never the login

## Architecture notes

- `convex/credentials.ts` is the seam between "who is this user" (Clerk)
  and "how do we reach Canvas". `getCanvasClient(ctx, userId)` is the only
  way to reach Canvas. Today it decrypts a manually issued token
  (`kind: "manual"`); the OAuth2 flow (Phase 3, once UW-Madison issues a
  developer key) plugs in behind the same interface.
- Canvas tokens are AES-GCM encrypted at rest and never leave the server.
- Two-tier sync (`convex/sync.ts`): a tiny activity-stream "tripwire" poll
  every 5 minutes; a real delta sync (submitted_since / graded_since) only
  when it changes; a full sync nightly. Crons dispatch, a Workpool fans
  out one job per user with retries.
- The Canvas client (`convex/canvas/client.ts`) is strictly sequential —
  Canvas throttles on concurrent requests per token, not frequency.

## Setup

1. `bun install`
2. **Convex**: `bunx convex dev` (currently configured for a local
   anonymous deployment; run `bunx convex login` to link a cloud project).
3. **Clerk**: create an app at clerk.com, enable the Convex integration
   (Configure > Integrations > Convex), then:
   - put the publishable key in `.env.local` as `VITE_CLERK_PUBLISHABLE_KEY`
   - set `CLERK_FRONTEND_API_URL` on the Convex deployment:
     `bunx convex env set CLERK_FRONTEND_API_URL https://<your-app>.clerk.accounts.dev`
4. **Encryption key** (already set on the local deployment):
   `bunx convex env set CANVAS_ENCRYPTION_KEY "$(openssl rand -base64 32)"`
5. `bun run dev` (frontend) and `bun run dev:backend` (Convex) in two
   terminals.
6. Sign in, open Settings, and connect your Canvas access token
   (UW–Madison students: request one via kb.wisc.edu/luwmad/156712).

## Compliance

Multi-user deployments MUST use Canvas OAuth2 with a developer key issued
by the institution. Asking another user to paste a manually generated
token violates the Canvas API Policy — the manual-token path exists only
for the developer's own account during development.

## Commands

- `bun run test` — regression tests for the backend and React components
- `bun run typecheck` — TypeScript across app, convex/, and tests
- `bun run lint` — ESLint
- `bun run dev` / `bun run dev:backend` — Vite / Convex dev servers

## Search index migration

After deploying this version to a deployment with existing Canvas data, run
`bunx convex run search:backfill '{}'` once. Add `--prod` when targeting production.
It populates search summaries in batches without changing Canvas source records.
Normal syncs then maintain the summaries. The backfill is safe to rerun.
