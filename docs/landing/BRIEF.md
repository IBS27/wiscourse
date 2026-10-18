# Landing page concept brief (shared by all five designs)

## What wiscourse is (say this plainly, no hype)
- A faster replacement UI for Canvas at UW-Madison, for students.
- Canvas data syncs into wiscourse's own database in the background. Every screen reads from that copy, so nothing waits on Canvas. Pages open instantly and update live.
- On top of the Canvas mirror it adds: an agenda-first home (Overdue / Today / Tomorrow / This week / Later), a week strip, unified todos (Canvas assignments + personal tasks with planned dates, subtasks, notes), natural-language quick add ("read ch 4 fri #cs537" -> task in CS 537 planned Friday), a chronological Inbox of announcements / grade postings / changed assignments, a course hub (modules, pages rendered in-app, files with preview, syllabus, announcements), Grades with what-if edits and "needed on remaining for X%", a real Calendar (week / month / day) with ICS export, Cmd-K search, Ask (chat over your courses), light + dark, keyboard friendly, works on phone (bottom tabs) and desktop (sidebar).
- Sign-in is Clerk (email / Google). Canvas is a linked connection in Settings. Grades only show once the instructor posts them. Submissions are confirmed writes.
- Do not invent statistics, user counts, testimonials with fake students, or speed multipliers. No "trusted by" walls. No pricing. If you want a number, use ones that are true in the product mock data (4 courses, CS 537 / MATH 340 / ECON 101 / STAT 324, Fall 2026) or none.

## Copy rules
- Plain, specific, student-facing. Short sentences. Say what it does. Example of the right register: "Canvas, but it loads." / "Your week, before Canvas finishes loading." / "Every assignment, every course, one agenda."
- Banned: em-dash and en-dash anywhere visible (use commas, periods, or a hyphen). Banned words: seamless, elevate, unleash, supercharge, effortless, revolutionize, next-gen, empower, journey, reimagine, "all in one place", "built for students, by students".
- No eyebrow above every section. Max 1 eyebrow per 3 sections (hero counts).
- One CTA intent and one label for it across the whole design: "Sign in" (primary). Optional secondary link: "How it works" (anchor) or "Open the app". Never two labels for the same intent.
- Hero: headline max 2 lines at desktop, subtext max 20 words, CTA visible without scrolling, top padding max 96px.
- A short honest footer: logo, "Not affiliated with UW-Madison or Instructure.", links Privacy, GitHub (href="#"), Sign in.

## Design language (must follow)
- Font: Inter (already loaded, body is set). Weights 500/600 for UI, 600 at -0.02em for titles. Display sizes up to ~56-64px are fine with letter-spacing -0.03em; nothing larger than 72px.
- Colours: use ONLY the CSS variables from the shell: --page --surface --sunken --raised --hover --line --line-2 --chip --ink --ink-2 --ink-3 --red --red-bg --today-bg --today-fg --course-indigo/amber/teal/sky/rose/emerald/violet/orange/none --brand --brand-ink --shadow --menu-shadow. Never hardcode a hex except pure transparency math (rgba of black/white).
- Red (--red) is the logo and "Overdue" only. It is NOT a UI accent. Primary buttons are --today-bg / --today-fg (near-black in light, near-white in dark). Do not make a red CTA.
- Course colour is carried as a 4px left rail on rows, a 6px dot, or a 1px card edge. Never as a fill or a big gradient blob.
- Radius: 6px chips / pills / day cells, 8px cards / fields / buttons, 999px counts / avatars. Pick that system and keep it. No 24px blobby cards.
- 1px --line borders everywhere instead of shadows. --shadow only on something that actually floats (a popover, a phone, a raised rail card).
- Calm and dense. The app reads like a planner, not a SaaS funnel. Whitespace generous between sections (96-140px), tight inside components (rows 9-11px vertical padding).
- Both themes must work: the shell toggles `.dark` on <html>. Your section declares its default via data-theme="light" or "dark". Check both.
- Product UI inside the page must be a faithful miniature of the real app (agenda rows with course rails, week strip with dots, the "New" rail, quick-add parse chips, grades what-if table, calendar week grid, Inbox feed, Cmd-K palette, course hub tabs). Use real-looking course data from docs/design.html (Project 2: Multithreaded Web Server, Homework 5: Eigenvalues and Diagonalization, Quiz 2: Sampling Distributions, Problem Set 3, Read Silberschatz ch. 4, etc.). These are real component previews of the product, not decoration. Make them crisp: 12.5-14px text, correct meta lines ("CS 537 · Due 11:59 PM · 1/3"), one middle dot per meta line max two.
- Icons: inline SVG from Lucide paths is fine (the app uses lucide). Keep stroke 1.75-2, 14-16px. No emoji.
- Motion must be motivated and honour prefers-reduced-motion (the shell already zeroes animations under it, but gate JS-driven loops too). Transforms and opacity only. Entry stagger on the hero preview, scroll reveals via IntersectionObserver, hover states on rows and buttons. No window scroll listeners; use IntersectionObserver or CSS scroll-driven animation.
- Responsive: every multi-column layout collapses to one column under 768px. Check at 390px wide too. Nav on one line, height <= 64px.

## Fragment contract (what you deliver)
Write exactly one file: docs/landing/dN.html (N is your number). It contains, in this order:
1. <style> ... </style> with every selector prefixed by `.dN ` (e.g. `.d2 .hero {}`), so nothing leaks between designs. Define any design-local variables on `.dN`.
2. <section class="design dN" id="dN" data-title="Short name" data-theme="light|dark"> ... full landing page markup (nav, hero, sections, footer) ... </section>
3. optional <script>(function(){ var root=document.getElementById('dN'); ... })();</script>. Scope all querySelector calls to `root`. If you run timers, start them on `wc:activate` (window event, detail.id) when detail.id==='dN' and stop them otherwise; also run once on load if root.classList.contains('is-active').
No <html>, <head>, <body>, no external scripts, no external fonts, no external images. Logo: `<span class="wc-logo" style="font-size:18px"><svg class="wc-mark"><use href="#wc-mark"/></svg><svg class="wc-word"><use href="#wc-word"/></svg></span>` (size via font-size). The mark alone: `<svg class="wc-mark" style="height:24px;width:37px"><use href="#wc-mark"/></svg>`.

## How to check your work (do this, several rounds)
1. `./build.sh` in docs/landing assembles index.html.
2. Screenshot with headless Chrome at desktop and phone, light and dark:
   `google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1440,2600 --screenshot=/tmp/dN-desktop.png "file://$PWD/index.html#dN"`
   `google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=390,2400 --screenshot=/tmp/dN-phone.png "file://$PWD/index.html#dN"`
   Force a theme with a query param: `file://$PWD/index.html?theme=dark#dN` or `?theme=light`. Without it the shell uses your data-theme.
   Hero-only viewport check: `--window-size=1440,900` (the CTA must be visible) and `--window-size=390,844`.
3. Read the screenshots with the Read tool. Fix anything that looks off: overlaps, clipped text, wrapped buttons, tiny previews, misaligned rows, bad contrast, boring sections. Do at least three look-and-fix rounds. Stop only when you would put your name on it.
4. Run the pre-flight list from the design skill on your own output (em-dash grep: `grep -nP '[\x{2013}\x{2014}]' dN.html` must return nothing inside visible text).
