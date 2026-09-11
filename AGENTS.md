# AGENTS.md

wiscourse: a fast replacement UI for Canvas at UW–Madison. Canvas data syncs
into Convex in the background; the UI reads only from Convex. Full context:
`docs/overview.html`.

## Commands

- `bun run typecheck` — TypeScript (app + convex/)
- `bun run lint` — ESLint

## Stack

Bun · React + Vite + TanStack Router (file routes) · Tailwind v4 + shadcn/ui ·
Convex · Clerk. TypeScript is pinned to v6 (v7 breaks typescript-eslint).

## Rules

- All Canvas access goes through `getCanvasClient()` in
  `convex/credentials.ts`. Never read or decrypt tokens elsewhere; never
  return tokens to a client.
- Canvas API: REST only. Sequential requests per token. Chunk
  `context_codes[]` by 10. Treat 403 "Rate Limit Exceeded" and 429 as
  throttling.
- Never show a grade unless `postedAt` is set.
- Assignment submissions are confirmed writes with pending/failed states,
  never optimistic.
- Never loop over users inside a cron — dispatch one Workpool job per user.
