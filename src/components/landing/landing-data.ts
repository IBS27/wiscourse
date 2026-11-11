import type { CSSProperties } from "react";

/**
 * Mock data for the signed-out landing page. Every preview on the page is a
 * miniature of a real screen, drawn from the same four courses the design docs
 * use (docs/design.html), so the previews read as the product and not as
 * decoration. Course colours are referenced by token name and resolved to the
 * `--course-*` variables at render time. The showcase panes keep their own
 * data next to their markup (./panes).
 */

export type CourseKey = "indigo" | "amber" | "teal" | "sky" | "none";

export const courseVar = (c: CourseKey) => `var(--course-${c})`;

/** `style` that sets the course colour (`--c`) for an element and its children. */
export const c = (key: CourseKey) => ({ "--c": courseVar(key) }) as CSSProperties;

export const COURSES: { key: CourseKey; code: string; name: string }[] = [
  { key: "indigo", code: "CS 537", name: "Operating Systems" },
  { key: "amber", code: "MATH 340", name: "Linear Algebra" },
  { key: "teal", code: "ECON 101", name: "Microeconomics" },
  { key: "sky", code: "STAT 324", name: "Intro Statistics" },
];

/* ---------- hero: Home ---------- */

export const WEEK: { label: string; day: number; dots: CourseKey[]; past?: boolean; today?: boolean }[] = [
  { label: "Sun", day: 16, dots: [], past: true },
  { label: "Mon", day: 17, dots: ["indigo"], past: true },
  { label: "Tue", day: 18, dots: [], past: true },
  { label: "Wed", day: 19, dots: ["indigo", "teal"], past: true },
  { label: "Thu", day: 20, dots: ["teal"], past: true },
  { label: "Fri", day: 21, dots: ["amber", "sky", "indigo"], today: true },
  { label: "Sat", day: 22, dots: ["teal"] },
];

export type AgendaRow = {
  id: string;
  c: CourseKey;
  code: string;
  title: string;
  /** "2 days late": shown in red before the due time. */
  late?: string;
  /** Meta after the course tag, in order ("Due 11:59 PM", "Personal"). */
  meta: string[];
  /** Subtasks done, as "2/4". */
  subtasks?: string;
  /** The quiet pill at the row's far edge. */
  status?: string;
  /** When it was marked done; set for rows that start out done. */
  doneAt?: string;
};

export const AGENDA: { title: string; detail?: string; red?: boolean; rows: AgendaRow[] }[] = [
  {
    title: "Overdue",
    red: true,
    rows: [
      { id: "p2", c: "indigo", code: "CS 537", title: "Project 2: Multithreaded Web Server", late: "2 days late", meta: ["Due Wed Aug 19, 11:59 PM"], subtasks: "2/4" },
      { id: "ps3", c: "teal", code: "ECON 101", title: "Problem Set 3: Elasticity and Consumer Surplus", late: "1 day late", meta: ["Due Thu Aug 20, 5:00 PM"] },
    ],
  },
  {
    title: "Today",
    detail: "Fri, Aug 21",
    rows: [
      { id: "hw5", c: "amber", code: "MATH 340", title: "Homework 5: Eigenvalues and Diagonalization", meta: ["Due 11:59 PM"], subtasks: "1/3" },
      { id: "quiz2", c: "sky", code: "STAT 324", title: "Quiz 2: Sampling Distributions", meta: ["Due 11:59 PM"], status: "Submitted 9:12 AM" },
      { id: "read4", c: "indigo", code: "CS 537", title: "Read Silberschatz ch. 4, Threads", meta: ["Planned today", "Personal"], status: "No due date" },
      { id: "lab3", c: "sky", code: "STAT 324", title: "Lab 3 write-up", meta: [], doneAt: "10:04 AM" },
    ],
  },
  {
    title: "Tomorrow",
    detail: "Sat, Aug 22",
    rows: [
      { id: "rq6", c: "teal", code: "ECON 101", title: "Reading quiz: ch. 6, Market Failure", meta: ["Due 11:59 PM"] },
    ],
  },
];

/** The hero's story: this task gets ticked off, then this quiz's grade posts. */
export const STORY = { doneId: "read4", doneAt: "2:41 PM", gradedId: "quiz2", graded: "Graded 18/20" } as const;

/* ---------- Recent feed ---------- */

export type FeedRow = {
  id: string;
  c: CourseKey;
  code: string;
  title: string;
  status: string;
  when: string;
  unread?: boolean;
  /** Position in the arrival order (1 is first) for rows that land while a preview plays. */
  arrives?: number;
};

export const FEED: { group: string; rows: FeedRow[] }[] = [
  {
    group: "Today",
    rows: [
      { id: "quiz2", c: "sky", code: "STAT 324", title: "Quiz 2: Sampling Distributions", status: "Graded 18/20", when: "now", unread: true, arrives: 3 },
      { id: "ext", c: "indigo", code: "CS 537", title: "Project 2 deadline extended to Friday", status: "Announcement", when: "2h", unread: true, arrives: 2 },
      { id: "hw3", c: "sky", code: "STAT 324", title: "Homework 3", status: "Graded 47/50", when: "4h", unread: true, arrives: 1 },
      { id: "ps4", c: "teal", code: "ECON 101", title: "Problem Set 4 due date moved", status: "Aug 26, 5:00 PM → Aug 28, 5:00 PM", when: "6h", unread: true },
    ],
  },
  {
    group: "Yesterday",
    rows: [
      { id: "hw6", c: "amber", code: "MATH 340", title: "Homework 6", status: "New assignment · Due Sep 1, 11:59 PM", when: "Thu" },
      { id: "disc", c: "sky", code: "STAT 324", title: "Discussion sections begin next week", status: "Announcement", when: "Thu" },
    ],
  },
  {
    group: "This week",
    rows: [
      { id: "p1", c: "indigo", code: "CS 537", title: "Project 1: xv6 Shell", status: "Graded 92/100", when: "Wed" },
      { id: "oh", c: "teal", code: "ECON 101", title: "Office hours moved to Social Sciences 6470", status: "Announcement", when: "Wed" },
    ],
  },
];

/* ---------- quick add ---------- */

export const QUICK_ADD_TEXT = "read ch 4 fri #cs537";

/** What is already planned for the day the quick-add demo files its task under. */
export const QUICK_ADD_DAY: { c: CourseKey; code: string; title: string; meta: string }[] = [
  { c: "amber", code: "MATH 340", title: "Homework 5: Eigenvalues and Diagonalization", meta: "Due 11:59 PM" },
  { c: "sky", code: "STAT 324", title: "Quiz 2: Sampling Distributions", meta: "Due 11:59 PM" },
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
