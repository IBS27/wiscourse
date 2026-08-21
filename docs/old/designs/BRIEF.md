# wiscourse UI design brief (M2)

Product: a fast replacement UI for Canvas at UW–Madison. Agenda-first planner. Read `docs/overview.html` (Product design section) for routes and rules.

Deliverable: ONE standalone HTML file `docs/design/<NN>-<slug>.html` (pure HTML + CSS, no frameworks, inline `<style>`, Google Fonts allowed). It is a high-fidelity static mockup, not an app. Keep explanatory text minimal: a title, one sentence of intent, and ≤1 short caption per mockup. Let the mockups speak.

Every page must show, with realistic fake data (UW courses like CS 537, MATH 340, ECON 101, STAT 324; real-looking assignment names; dates around Fri Aug 21 2026):
1. Desktop app shell (≈1280px wide frame): sidebar nav (Home, Inbox, Courses, Tasks, Grades, Calendar, Settings) + Home route = sync status line, sections Overdue / Today / Tomorrow / This week / Later, and the side "New" panel (unread announcements, grade postings, new/changed assignments). Include a first-sync progress state OR an empty state somewhere.
2. Mobile shell (≈390px frame): bottom tabs + Home agenda, with the "New" panel collapsed.
3. A todo item in detail: Canvas assignment todo (course, due time, planned date, subtasks, notes, submission status) vs a personal task. Done/undone affordance. Show overdue styling.
4. Quick-add input parsing natural language ("read ch 4 fri #cs537") with the parsed chips shown.
5. Light AND dark: render both themes side by side OR add a working toggle (small inline script allowed for a toggle only).
6. A small "tokens" strip: type scale, spacing rhythm, radius, color roles.

Brand: logo = two-chevron W mark (left half Badger Red #c5050c, right half ink) + wordmark "wiscourse" with "wisc" in red. SVG of the mark is in `public/favicon.svg`; wordmark spec in `docs/logo-designs.html`. Red is the LOGO color; whether red is used as a UI accent is your call but be restrained. Dark-mode red is #ff4b54.

Values: calm, dense, keyboard-friendly, modern, minimal. Every screen loads instantly from Convex, so no spinners in the steady state. Never show a grade unless posted. Course colours are user-set locally.

Don't: use stock-shadcn default look, gradients-for-decoration, emoji as icons, lorem ipsum, big hero headers, or >2 typefaces. Use inline SVG icons (simple 1.5px strokes) — a handful is enough.
