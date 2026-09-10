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
- Full content sync fetches the front page, fills missing page bodies, and
  follows same-course page/file links from modules, pages, and syllabus HTML.
  A denied listing is not treated as an authoritative empty snapshot.
- Course overviews use the instructor's homepage for homepage-based courses.
  "This week" uses explicit dates in weekly module/page titles; chapters and
  undated resources retain instructor ordering. Syllabi can be HTML, linked
  documents, or collections of pages.
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

## Deployment

Vercel hosts the Vite frontend; Convex hosts the backend and database.
`vercel.json` configures Bun installation, the Convex deployment/build command,
and the fallback needed for direct links to client-side routes.

1. Configure Clerk production for your domain and enable its Convex integration.
2. Set `CLERK_FRONTEND_API_URL`, `CANVAS_ENCRYPTION_KEY`, and optionally
   `OPENAI_API_KEY` in the **production Convex deployment**, not in Vercel.
   Use the production Clerk Frontend API URL. Keep the encryption key stable
   after users connect Canvas.
3. Import this repository into Vercel. Set `CONVEX_DEPLOY_KEY` to a production
   Convex deploy key with `deployment:deploy` permission, and set
   `VITE_CLERK_PUBLISHABLE_KEY` to the production Clerk publishable key.
   Scope both variables to **Production**.
4. Deploy the production branch. The build command supplies `VITE_CONVEX_URL`
   automatically; do not copy `CONVEX_DEPLOYMENT` from `.env.local` into Vercel.
5. Verify sign-in, connecting Canvas, sync completion, and refreshing a course URL.

For branch previews, configure a separate Convex preview deploy key scoped to
Vercel's **Preview** environment, development Clerk credentials, and Convex
preview environment defaults. Never use the production deploy key for previews.
New production deployments start with an empty database; development users and
Canvas connections are not migrated automatically.

## Search index migration

After deploying this version to a deployment with existing Canvas data, run
`bunx convex run search:backfill '{}'` once. Add `--prod` when targeting production.
It populates search summaries in batches without changing Canvas source records.
Normal syncs then maintain the summaries. The backfill is safe to rerun.

### AI course maps (review)

The **Organize this course** link on Overview runs a GPT-5.6 Luna interpreter at medium reasoning using
AI SDK's `ToolLoopAgent`, with threads and step traces stored by `@convex-dev/agent`.
Set `OPENAI_API_KEY` in the Convex deployment environment, then choose **Interpret
course**. This opts that course into refreshes after full syncs when relevant
source content changes. **Stop automatic refresh** cancels the current generation
and disables subsequent refreshes. Disconnecting Canvas disables interpretation.

Fresh, validated maps drive Overview with chapter navigation, weekly plans, or resource groups and inline page reading. Instructor schedule tables are displayed directly from their source pages. Review interpretation remains a secondary screen. Missing or stale maps use the original overview; a failed refresh can keep a previous map only while its source revision still matches. Modules and Files remain accessible, and material outside the interpreted groups is listed under More course material. Each map
contains sections, essentials, teaching dates, source quotes, conflicts, and
unresolved resources. Resource IDs and quoted evidence are checked against a
user-scoped snapshot. A source revision change rejects the in-flight result;
failed runs preserve the previous map. Identical snapshots reuse the saved map.

Runs allow 10 model steps (including at most one evidence-repair pass), 24 tool calls, 160,000 supplied characters, a conservative
250,000-token budget, one provider retry, and a four-minute timeout. The separate
Workpool runs at most two interpretations concurrently. PDF extraction supports
text PDFs up to 10 MB / 100 pages / 150,000 characters and caches by source version;
scanned or unsupported documents remain unresolved. Expired file links are refreshed
through the Canvas credential gateway while holding the per-user sync lease.
Course text is sent to OpenAI and stored in private backend agent traces; credentials,
grades, submissions, and signed download links are excluded from model inputs.
