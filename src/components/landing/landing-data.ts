/**
 * Mock data for the signed-out landing page. Every preview on the page is a
 * miniature of a real screen, drawn from the same four courses the design docs
 * use (docs/design.html), so the previews read as the product and not as
 * decoration. Course colours are referenced by token name and resolved to the
 * `--course-*` variables at render time.
 */

export type CourseKey = "indigo" | "amber" | "teal" | "sky" | "none";

export const courseVar = (c: CourseKey) => `var(--course-${c})`;

export const COURSES: { key: CourseKey; code: string; name: string }[] = [
  { key: "indigo", code: "CS 537", name: "Operating Systems" },
  { key: "amber", code: "MATH 340", name: "Linear Algebra" },
  { key: "teal", code: "ECON 101", name: "Microeconomics" },
  { key: "sky", code: "STAT 324", name: "Intro Statistics" },
];

/* ---------- hero: Home ---------- */

export const WEEK: { label: string; day: number; dots: CourseKey[]; more?: number; today?: boolean }[] = [
  { label: "Sun", day: 16, dots: [] },
  { label: "Mon", day: 17, dots: ["indigo"] },
  { label: "Tue", day: 18, dots: [] },
  { label: "Wed", day: 19, dots: ["indigo", "teal"] },
  { label: "Thu", day: 20, dots: ["teal"] },
  { label: "Fri", day: 21, dots: ["amber", "sky", "indigo"], more: 2, today: true },
  { label: "Sat", day: 22, dots: ["teal"] },
];

export type AgendaEntry =
  | { kind: "section"; title: string; detail?: string; count: number; red?: boolean }
  | { kind: "row"; c: CourseKey; title: string; meta: string; status: string; tone?: "red" | "ok"; done?: boolean };

export const AGENDA: AgendaEntry[] = [
  { kind: "section", title: "Overdue", count: 2, red: true },
  { kind: "row", c: "indigo", title: "Project 2: Multithreaded Web Server", meta: "CS 537 · Due Wed, 11:59 PM · 2/4", status: "2 days late", tone: "red" },
  { kind: "row", c: "teal", title: "Problem Set 3: Elasticity and Consumer Surplus", meta: "ECON 101 · Due Thu, 5:00 PM", status: "1 day late", tone: "red" },
  { kind: "section", title: "Today", detail: "Fri, Aug 21", count: 5 },
  { kind: "row", c: "amber", title: "Homework 5: Eigenvalues and Diagonalization", meta: "MATH 340 · Due 11:59 PM · 1/3", status: "Not submitted" },
  { kind: "row", c: "sky", title: "Quiz 2: Sampling Distributions", meta: "STAT 324 · Due 11:59 PM", status: "Submitted 9:12 AM", tone: "ok" },
  { kind: "row", c: "indigo", title: "Read Silberschatz ch. 4, Threads", meta: "CS 537 · Planned today · Personal", status: "No due date" },
  { kind: "row", c: "sky", title: "Lab 3 write-up", meta: "STAT 324 · Done 10:04 AM", status: "Undo", done: true },
  { kind: "section", title: "Tomorrow", detail: "Sat, Aug 22", count: 1 },
  { kind: "row", c: "teal", title: "Reading quiz: ch. 6, Market Failure", meta: "ECON 101 · Due 11:59 PM", status: "Not submitted" },
];

/* ---------- quick add ---------- */

export const QUICK_ADD_TEXT = "read ch 4 fri #cs537";

/* ---------- New rail ---------- */

export const RAIL: { group: string; cards: { c: CourseKey; code: string; when: string; title: string; grade?: string; sub: string }[] }[] = [
  {
    group: "Today",
    cards: [
      { c: "indigo", code: "CS 537", when: "2h", title: "Project 2 deadline extended to Friday", sub: "Given the discussion-section conflict, we're moving…" },
      { c: "sky", code: "STAT 324", when: "4h", title: "Homework 3 graded", grade: "47/50", sub: "Posted by Peterson, T. · 2 comments" },
      { c: "teal", code: "ECON 101", when: "6h", title: "Problem Set 4 due date moved", sub: "Aug 26, 5:00 PM → Aug 28, 5:00 PM" },
    ],
  },
  {
    group: "Yesterday",
    cards: [{ c: "amber", code: "MATH 340", when: "Thu", title: "New assignment: Homework 6", sub: "Due Sep 1, 11:59 PM · 40 points" }],
  },
];

/* ---------- showcase ---------- */

export type PaneKey = "inbox" | "courses" | "grades" | "calendar" | "search" | "ask";

export const SHOWCASE: { key: PaneKey; title: string; blurb: string }[] = [
  { key: "inbox", title: "Inbox", blurb: "Announcements, grade postings and changed assignments, newest first." },
  { key: "courses", title: "Courses", blurb: "Modules, pages, files and syllabus, rendered in wiscourse." },
  { key: "grades", title: "Grades", blurb: "Weighted by group. Edit a score to see where you land." },
  { key: "calendar", title: "Calendar", blurb: "Lectures, due times and planned work. Subscribe from any calendar app." },
  { key: "search", title: "Search", blurb: "Press ⌘K to jump to any course, assignment, page or file." },
  { key: "ask", title: "Ask", blurb: "Questions about your courses, answered from your own syllabi and pages." },
];

export const INBOX: { group: string; items: { c: CourseKey; code: string; title: string; grade?: string; when: string; excerpt: string; unread?: boolean }[] }[] = [
  {
    group: "Today",
    items: [
      { c: "indigo", code: "CS 537", title: "Project 2 deadline extended to Friday", when: "2h", excerpt: "Given the discussion-section conflict, we are moving the due date to Friday at 11:59 PM.", unread: true },
      { c: "sky", code: "STAT 324", title: "Homework 3 graded", grade: "47/50", when: "4h", excerpt: "Posted by Peterson, T. · 2 comments", unread: true },
      { c: "teal", code: "ECON 101", title: "Problem Set 4 due date moved", when: "6h", excerpt: "Aug 26, 5:00 PM to Aug 28, 5:00 PM", unread: true },
    ],
  },
  {
    group: "Yesterday",
    items: [
      { c: "amber", code: "MATH 340", title: "New assignment: Homework 6", when: "Thu", excerpt: "Due Sep 1, 11:59 PM · 40 points", unread: true },
      { c: "sky", code: "STAT 324", title: "Discussion sections begin next week", when: "Thu", excerpt: "Sections meet in Van Vleck B119 starting Aug 25.", unread: true },
      { c: "indigo", code: "CS 537", title: "Project 1 graded", grade: "92/100", when: "Wed", excerpt: "Read Wed 4:20 PM" },
      { c: "teal", code: "ECON 101", title: "Office hours moved to Social Sciences 6470", when: "Wed", excerpt: "Starting this week, Tuesdays 2 to 4 PM." },
      { c: "amber", code: "MATH 340", title: "Homework 4 graded", grade: "38/40", when: "Tue", excerpt: "Posted by Ellenberg, J." },
    ],
  },
];

export type ModuleItem = { icon: "page" | "file" | "assignment" | "external"; title: string; right: string; done?: boolean };
export const MODULES: { title: string; open: boolean; items: ModuleItem[] }[] = [
  {
    title: "Week 4: Threads and Concurrency",
    open: true,
    items: [
      { icon: "page", title: "Lecture notes: threads and the pthreads API", right: "Viewed", done: true },
      { icon: "file", title: "p2-starter.tar.gz", right: "212 KB" },
      { icon: "assignment", title: "Project 2: Multithreaded Web Server", right: "Due Wed, 11:59 PM" },
      { icon: "external", title: "Discussion: scheduler trade-offs", right: "Opens in Canvas" },
    ],
  },
  {
    title: "Week 5: CPU Scheduling",
    open: true,
    items: [
      { icon: "page", title: "Lecture 9: CPU scheduling policies", right: "Page" },
      { icon: "file", title: "scheduler-handout.pdf", right: "1.4 MB" },
      { icon: "assignment", title: "Project 3: xv6 Scheduler", right: "Due Mon Aug 24" },
    ],
  },
  {
    title: "Week 6: Virtual Memory",
    open: true,
    items: [
      { icon: "page", title: "Lecture 11: Address spaces", right: "Page" },
      { icon: "file", title: "vm-worksheet.pdf", right: "380 KB" },
    ],
  },
  { title: "Week 7: Paging and TLBs", open: false, items: [] },
  { title: "Week 8: Midterm review", open: false, items: [] },
];

export type GradeRow =
  | { kind: "group"; title: string; weight: string; score: string; edit?: boolean; muted?: boolean }
  | { kind: "sub"; title: string; score: string; muted?: boolean };
export const GRADES: GradeRow[] = [
  { kind: "group", title: "Projects", weight: "40%", score: "88.5%" },
  { kind: "sub", title: "Project 1: xv6 Shell", score: "92 / 100" },
  { kind: "sub", title: "Project 2: Multithreaded Web Server", score: "Not graded", muted: true },
  { kind: "sub", title: "Project 3: xv6 Scheduler", score: "Not yet", muted: true },
  { kind: "group", title: "Homework", weight: "20%", score: "94.2%" },
  { kind: "sub", title: "Homework 1", score: "19 / 20" },
  { kind: "sub", title: "Homework 2", score: "18 / 20" },
  { kind: "sub", title: "Homework 3", score: "20 / 20" },
  { kind: "sub", title: "Homework 4", score: "17 / 20" },
  { kind: "group", title: "Midterm", weight: "15%", score: "86", edit: true },
  { kind: "sub", title: "Midterm, Oct 15", score: "What-if", muted: true },
  { kind: "group", title: "Final", weight: "25%", score: "Not yet", muted: true },
];

/* ---------- calendar ---------- */

/** Grid geometry: header 46px + due strip 26px, then 60px per hour from 10 AM to 5 PM. */
export const CAL = { headerPx: 46, stripPx: 26, pxPerHour: 60, startHour: 10, endHour: 17 } as const;

export const CAL_DAYS: { label: string; day: number; today?: boolean; due: { c: CourseKey; label: string }[] }[] = [
  { label: "Mon", day: 17, due: [] },
  { label: "Tue", day: 18, due: [] },
  { label: "Wed", day: 19, due: [{ c: "indigo", label: "P2 due" }] },
  { label: "Thu", day: 20, due: [] },
  { label: "Fri", day: 21, today: true, due: [{ c: "amber", label: "HW 5" }, { c: "sky", label: "Quiz 2" }] },
];

export type CalEvent = { day: number; c: CourseKey; title: string; sub: string; start: string; end: string; kind?: "plan" | "due" };
export const CAL_EVENTS: CalEvent[] = [
  { day: 0, c: "indigo", title: "CS 537 Lecture", sub: "10:00 to 10:50 AM", start: "10:00", end: "10:50" },
  { day: 0, c: "teal", title: "ECON 101 Lecture", sub: "12:05 to 1:20 PM", start: "12:05", end: "13:20" },
  { day: 1, c: "amber", title: "MATH 340 Lecture", sub: "11:00 AM to 12:15 PM", start: "11:00", end: "12:15" },
  { day: 1, c: "sky", title: "STAT 324 Lab", sub: "1:20 to 2:35 PM", start: "13:20", end: "14:35" },
  { day: 2, c: "indigo", title: "CS 537 Lecture", sub: "10:00 to 10:50 AM", start: "10:00", end: "10:50" },
  { day: 2, c: "teal", title: "ECON 101 Lecture", sub: "12:05 to 1:20 PM", start: "12:05", end: "13:20" },
  { day: 2, c: "indigo", title: "Finish Project 2", sub: "Planned · 2 to 3 PM", start: "14:00", end: "15:00", kind: "plan" },
  { day: 3, c: "amber", title: "MATH 340 Lecture", sub: "11:00 AM to 12:15 PM", start: "11:00", end: "12:15" },
  { day: 3, c: "sky", title: "STAT 324 Lab", sub: "1:20 to 2:35 PM", start: "13:20", end: "14:35" },
  { day: 3, c: "teal", title: "Problem Set 3 due", sub: "5:00 PM", start: "17:00", end: "17:38", kind: "due" },
  { day: 4, c: "indigo", title: "CS 537 Lecture", sub: "10:00 to 10:50 AM", start: "10:00", end: "10:50" },
  { day: 4, c: "none", title: "CS 537 office hours", sub: "Planned · 1 to 2 PM", start: "13:00", end: "14:00", kind: "plan" },
];

/** Minutes since midnight for an "HH:MM" string. */
export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Pixel offset of a time from the top of a calendar column. */
export const calTop = (hhmm: string) => CAL.headerPx + CAL.stripPx + ((minutes(hhmm) - CAL.startHour * 60) * CAL.pxPerHour) / 60;

/* ---------- search ---------- */

export const SEARCH: { group: string; rows: { c?: CourseKey; icon?: "task" | "calendar"; title: string; meta?: string; keys?: string[]; on?: boolean }[] }[] = [
  { group: "Assignments", rows: [{ c: "indigo", title: "Project 3: xv6 Scheduler", meta: "CS 537 · Due Mon Aug 24", on: true }] },
  { group: "Pages", rows: [{ c: "indigo", title: "Lecture 9: CPU scheduling policies", meta: "CS 537" }, { c: "teal", title: "Discussion section schedule", meta: "ECON 101" }] },
  { group: "Files", rows: [{ c: "indigo", title: "scheduler-handout.pdf", meta: "CS 537 · 1.4 MB" }] },
  { group: "Announcements", rows: [{ c: "sky", title: "Discussion sections begin next week", meta: "STAT 324" }] },
  { group: "Actions", rows: [{ icon: "task", title: "Add a task", keys: ["N"] }, { icon: "calendar", title: "Go to Calendar", keys: ["G", "C"] }] },
];

/* ---------- ask ---------- */

export const ASK_THREADS = ["CS 537 midterm", "Late policy for ECON 101", "What to read before Monday", "Plan this week"];

/* ---------- first sync ---------- */

export const FIRST_SYNC: { label: string; value: string; strong?: string; state: "done" | "busy" | "wait" }[] = [
  { label: "Courses", strong: "4", value: " active", state: "done" },
  { label: "Assignments", strong: "128", value: "", state: "done" },
  { label: "Submissions and grades", value: "3 of 4 courses", state: "busy" },
  { label: "Announcements and modules", value: "queued", state: "wait" },
];
