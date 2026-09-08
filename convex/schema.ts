import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { courseMapValidator, resultResourceValidator } from "./lib/courseMap";
import { searchFields } from "./lib/searchFields";

// Design rule: mirror Canvas's native containers faithfully (modules, pages,
// files, quizzes, discussions, ...) instead of modelling any one instructor's
// course structure. `courses.defaultView` + `courses.tabs` record how the
// instructor set the course up; the UI picks its front door from those.
//
// Every synced table carries `userId` (Clerk subject), `canvasId` and
// `syncedAt`, and has a `by_user_canvasId` index used for upserts.

// A student's own submission state, embedded on the assignment.
// `postedAt` is null while the teacher withholds grades (manual post
// policy) — never show `score` unless `postedAt` is set.
export const submissionFields = v.object({
  submittedAt: v.optional(v.number()),
  workflowState: v.string(),
  score: v.optional(v.number()),
  grade: v.optional(v.string()),
  late: v.optional(v.boolean()),
  missing: v.optional(v.boolean()),
  postedAt: v.optional(v.number()),
  comments: v.optional(
    v.array(
      v.object({
        authorName: v.string(),
        comment: v.string(),
        createdAt: v.number(),
      }),
    ),
  ),
});

export const instructorFields = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  role: v.union(v.literal("teacher"), v.literal("ta")),
});

export const scoreStatisticsFields = v.object({
  min: v.number(),
  max: v.number(),
  mean: v.number(),
  median: v.optional(v.number()),
  lowerQuartile: v.optional(v.number()),
  upperQuartile: v.optional(v.number()),
});

export const courseDefaultView = v.union(
  v.literal("feed"),
  v.literal("wiki"),
  v.literal("modules"),
  v.literal("assignments"),
  v.literal("syllabus"),
);

export const moduleState = v.union(
  v.literal("locked"),
  v.literal("unlocked"),
  v.literal("started"),
  v.literal("completed"),
);

export const moduleItemType = v.union(
  v.literal("Assignment"),
  v.literal("Page"),
  v.literal("File"),
  v.literal("Discussion"),
  v.literal("Quiz"),
  v.literal("ExternalUrl"),
  v.literal("ExternalTool"),
  v.literal("SubHeader"),
);

export const completionRequirement = v.object({
  type: v.string(), // must_view | must_submit | must_contribute | min_score | must_mark_done
  minScore: v.optional(v.number()),
  completed: v.optional(v.boolean()),
});

// Kinds of synced entities that can be "seen" or overridden locally.
export const entityKind = v.union(
  v.literal("grade"),
  v.literal("assignment"),
  v.literal("quiz"),
  v.literal("discussion"),
  v.literal("page"),
  v.literal("file"),
  v.literal("moduleItem"),
  v.literal("calendarEvent"),
  v.literal("assignmentChange"),
);

// Canvas sources a todo can mirror.
export const todoCanvasKind = v.union(
  v.literal("assignment"),
  v.literal("quiz"),
  v.literal("discussion"),
);

export const subtask = v.object({
  id: v.string(),
  title: v.string(),
  done: v.boolean(),
});

// Palette keys; the light/dark values live in src/index.css.
export const courseColor = v.union(
  v.literal("indigo"),
  v.literal("amber"),
  v.literal("teal"),
  v.literal("sky"),
  v.literal("rose"),
  v.literal("emerald"),
  v.literal("violet"),
  v.literal("orange"),
);
export const COURSE_COLORS = [
  "indigo",
  "amber",
  "teal",
  "sky",
  "rose",
  "emerald",
  "violet",
  "orange",
] as const;

// Shared column set for per-course synced content.
const synced = {
  userId: v.string(),
  courseCanvasId: v.number(),
  canvasId: v.number(),
  syncedAt: v.number(),
};

export default defineSchema({
  courseInterpretations: defineTable({
    userId: v.string(), courseCanvasId: v.number(), enabled: v.boolean(), sourceRevision: v.number(), generation: v.number(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("ready"), v.literal("failed"), v.literal("blocked"), v.literal("stale")),
    requestedAt: v.number(), startedAt: v.optional(v.number()), finishedAt: v.optional(v.number()),
    snapshotHash: v.optional(v.string()), resultRevision: v.optional(v.number()), resultHash: v.optional(v.string()),
    map: v.optional(courseMapValidator), resources: v.optional(v.array(resultResourceValidator)),
    model: v.string(), promptVersion: v.string(), threadId: v.optional(v.string()),
    inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()), toolCalls: v.optional(v.number()),
    error: v.optional(v.string()), validationIssues: v.optional(v.array(v.string())),
  }).index("by_user_course", ["userId", "courseCanvasId"]),
  courseDocuments: defineTable({
    userId: v.string(), courseCanvasId: v.number(), fileCanvasId: v.number(), fingerprint: v.string(),
    text: v.string(), pages: v.number(), extractedAt: v.number(),
  }).index("by_user_course_file", ["userId", "courseCanvasId", "fileCanvasId"]),
  searchEntries: defineTable({ userId: v.string(), ...searchFields })
    .index("by_user_course", ["userId", "courseCanvasId"])
    .index("by_user_kind_canvasId", ["userId", "kind", "canvasId"]),
  // The seam between "who is this user" (Clerk) and "how do we reach
  // Canvas". Tokens are AES-GCM encrypted; they must never reach a client.
  canvasCredentials: defineTable({
    userId: v.string(), // Clerk subject
    instance: v.string(), // e.g. "canvas.wisc.edu"
    kind: v.union(v.literal("manual"), v.literal("oauth")),
    canvasUserId: v.optional(v.number()),
    canvasUserName: v.optional(v.string()),
    accessTokenEncrypted: v.string(),
    refreshTokenEncrypted: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("invalid")),
  }).index("by_user", ["userId"]),

  syncState: defineTable({
    userId: v.string(),
    // JSON snapshot of /users/self/activity_stream/summary; the tripwire
    // compares against this to decide if a real sync is needed.
    tripwireSnapshot: v.optional(v.string()),
    lastTripwireAt: v.optional(v.number()),
    lastDeltaSyncAt: v.optional(v.number()),
    lastFullSyncAt: v.optional(v.number()),
    syncLeaseStartedAt: v.optional(v.number()),
    syncFullRequested: v.optional(v.boolean()),
    rateLimitRemaining: v.optional(v.number()),
    status: v.union(v.literal("idle"), v.literal("syncing"), v.literal("error")),
    lastError: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // -------------------------------------------------------------------------
  // Courses

  courses: defineTable({
    userId: v.string(),
    canvasId: v.number(),
    name: v.string(),
    courseCode: v.string(),
    term: v.optional(v.string()),
    // Enrollment-term id and dates. Academic terms carry dates; the
    // catch-all terms Canvas admins use for orientation/advising courses
    // do not, which is how the UI tells "this semester" from "ongoing".
    termId: v.optional(v.number()),
    termStartAt: v.optional(v.number()),
    termEndAt: v.optional(v.number()),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    isFavorite: v.optional(v.boolean()),
    // How the instructor set the course up. `defaultView` is the landing
    // tab in Canvas; `tabs` is the ordered list of nav tabs the instructor
    // left visible (Canvas tab ids: home, modules, pages, files, ...).
    defaultView: v.optional(courseDefaultView),
    tabs: v.optional(v.array(v.string())),
    syllabusBody: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    enrollmentState: v.optional(
      v.union(v.literal("active"), v.literal("completed")),
    ),
    instructors: v.optional(v.array(instructorFields)),
    verifiedInstructors: v.optional(v.array(instructorFields)),
    // Enrollment-level totals. Respect the posting policy: both are
    // undefined unless Canvas reports them, and `hideFinalGrades` means
    // the instructor hides totals entirely.
    currentScore: v.optional(v.number()),
    currentGrade: v.optional(v.string()),
    finalScore: v.optional(v.number()),
    finalGrade: v.optional(v.string()),
    hideFinalGrades: v.optional(v.boolean()),
    applyAssignmentGroupWeights: v.optional(v.boolean()),
    syncedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_canvasId", ["userId", "canvasId"]),

  assignmentGroups: defineTable({
    ...synced,
    name: v.string(),
    position: v.number(),
    groupWeight: v.optional(v.number()), // percent, when weighting is on
    dropLowest: v.optional(v.number()),
    dropHighest: v.optional(v.number()),
    neverDrop: v.optional(v.array(v.number())), // assignment canvasIds
  })
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_course", ["userId", "courseCanvasId"]),

  gradingPeriods: defineTable({
    ...synced,
    title: v.string(),
    startAt: v.number(),
    endAt: v.number(),
    weight: v.optional(v.number()),
  })
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_course", ["userId", "courseCanvasId"]),

  // -------------------------------------------------------------------------
  // Gradeable things

  assignments: defineTable({
    ...synced,
    name: v.string(),
    description: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    unlockAt: v.optional(v.number()),
    lockAt: v.optional(v.number()),
    pointsPossible: v.optional(v.number()),
    gradingType: v.optional(v.string()), // points | percent | letter_grade | gpa_scale | pass_fail | not_graded
    assignmentGroupCanvasId: v.optional(v.number()),
    position: v.optional(v.number()),
    htmlUrl: v.string(),
    submissionTypes: v.array(v.string()),
    // Graded quizzes and discussions are also assignments; these link back
    // so the UI can open the right thing.
    quizCanvasId: v.optional(v.number()),
    discussionCanvasId: v.optional(v.number()),
    lockedForUser: v.optional(v.boolean()),
    omitFromFinalGrade: v.optional(v.boolean()),
    submission: v.optional(submissionFields),
    scoreStatistics: v.optional(scoreStatisticsFields),
    // Canvas-side timestamps: "new assignment" means created in Canvas
    // recently, not synced recently.
    canvasCreatedAt: v.optional(v.number()),
    canvasUpdatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_course", ["userId", "courseCanvasId"])
    .index("by_user_dueAt", ["userId", "dueAt"]),

  assignmentChanges: defineTable({
    userId: v.string(),
    courseCanvasId: v.number(),
    assignmentCanvasId: v.number(),
    field: v.union(v.literal("dueAt"), v.literal("pointsPossible")),
    before: v.optional(v.number()),
    after: v.optional(v.number()),
    changedAt: v.number(),
  })
    .index("by_user_changedAt", ["userId", "changedAt"])
    .index("by_user_assignment", ["userId", "assignmentCanvasId"]),

  quizzes: defineTable({
    ...synced,
    title: v.string(),
    description: v.optional(v.string()),
    quizType: v.string(), // practice_quiz | assignment | graded_survey | survey
    dueAt: v.optional(v.number()),
    unlockAt: v.optional(v.number()),
    lockAt: v.optional(v.number()),
    pointsPossible: v.optional(v.number()),
    timeLimitMinutes: v.optional(v.number()),
    allowedAttempts: v.optional(v.number()), // -1 = unlimited
    questionCount: v.optional(v.number()),
    assignmentCanvasId: v.optional(v.number()),
    htmlUrl: v.string(),
    lockedForUser: v.optional(v.boolean()),
  })
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_course", ["userId", "courseCanvasId"])
    .index("by_user_dueAt", ["userId", "dueAt"]),

  // Discussions and announcements share one table: an announcement is a
  // discussion topic with `isAnnouncement: true`.
  discussions: defineTable({
    ...synced,
    title: v.string(),
    message: v.optional(v.string()),
    isAnnouncement: v.boolean(),
    postedAt: v.optional(v.number()),
    lastReplyAt: v.optional(v.number()),
    dueAt: v.optional(v.number()), // graded discussions
    assignmentCanvasId: v.optional(v.number()),
    authorName: v.optional(v.string()),
    unreadCount: v.optional(v.number()),
    readState: v.optional(v.string()), // read | unread (Canvas-side)
    locked: v.optional(v.boolean()),
    pinned: v.optional(v.boolean()),
    htmlUrl: v.string(),
  })
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_course", ["userId", "courseCanvasId"])
    .index("by_user_dueAt", ["userId", "dueAt"])
    .index("by_user_course_announcement_postedAt", [
      "userId",
      "courseCanvasId",
      "isAnnouncement",
      "postedAt",
    ])
    .index("by_user_announcement_postedAt", ["userId", "isAnnouncement", "postedAt"]),

  // -------------------------------------------------------------------------
  // Course content containers

  modules: defineTable({
    ...synced,
    name: v.string(),
    position: v.number(),
    unlockAt: v.optional(v.number()),
    state: v.optional(moduleState),
    prerequisiteModuleCanvasIds: v.array(v.number()),
    requireSequentialProgress: v.boolean(),
    published: v.optional(v.boolean()),
    itemCount: v.optional(v.number()),
  })
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_course", ["userId", "courseCanvasId"]),

  // Polymorphic pointer into the native tables: modules are a *view* over
  // assignments/pages/files/..., never a copy of them.
  moduleItems: defineTable({
    ...synced,
    moduleCanvasId: v.number(),
    position: v.number(),
    indent: v.number(),
    type: moduleItemType,
    title: v.string(),
    contentCanvasId: v.optional(v.number()), // assignment/file/discussion/quiz id
    pageUrl: v.optional(v.string()), // Page items key by slug, not id
    externalUrl: v.optional(v.string()),
    htmlUrl: v.optional(v.string()),
    published: v.optional(v.boolean()),
    completionRequirement: v.optional(completionRequirement),
  })
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_course", ["userId", "courseCanvasId"])
    .index("by_user_module", ["userId", "moduleCanvasId"]),

  pages: defineTable({
    ...synced, // canvasId = page_id
    url: v.string(), // slug; the stable key Canvas uses in links
    title: v.string(),
    body: v.optional(v.string()),
    isFrontPage: v.boolean(),
    contentUnavailable: v.optional(v.boolean()),
    published: v.boolean(),
    updatedAt: v.optional(v.number()),
    htmlUrl: v.string(),
    lockedForUser: v.optional(v.boolean()),
  })
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_course", ["userId", "courseCanvasId"])
    .index("by_user_course_url", ["userId", "courseCanvasId", "url"])
    .index("by_user_course_front", ["userId", "courseCanvasId", "isFrontPage"]),

  folders: defineTable({
    ...synced,
    parentFolderCanvasId: v.optional(v.number()),
    name: v.string(),
    fullName: v.string(), // "course files/Lectures/Week 1"
    position: v.optional(v.number()),
    filesCount: v.optional(v.number()),
    foldersCount: v.optional(v.number()),
    lockedForUser: v.optional(v.boolean()),
  })
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_course", ["userId", "courseCanvasId"])
    .index("by_user_parent", ["userId", "parentFolderCanvasId"]),

  files: defineTable({
    ...synced,
    folderCanvasId: v.optional(v.number()),
    displayName: v.string(),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    // Download URLs embed a short-lived verifier; refresh via
    // GET /files/:id when a stored one stops working.
    url: v.string(),
    thumbnailUrl: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
    modifiedAt: v.optional(v.number()),
    lockedForUser: v.optional(v.boolean()),
    hidden: v.optional(v.boolean()),
  })
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_course", ["userId", "courseCanvasId"])
    .index("by_user_folder", ["userId", "folderCanvasId"]),

  // -------------------------------------------------------------------------
  // Calendar + todos

  calendarEvents: defineTable({
    userId: v.string(),
    source: v.union(v.literal("canvas"), v.literal("local")),
    canvasId: v.optional(v.number()),
    contextCode: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.optional(v.number()),
    allDay: v.optional(v.boolean()),
    location: v.optional(v.string()),
    syncedAt: v.optional(v.number()),
  })
    .index("by_user_startAt", ["userId", "startAt"])
    .index("by_user_canvasId", ["userId", "canvasId"]),

  // The one local-write table for todos. A Canvas item (assignment,
  // quiz, graded discussion) stays a pure mirror in its own table; the
  // student's plan for it — planned day, subtasks, notes, done — lives in
  // a row here keyed by (canvasKind, canvasId). Personal tasks are rows
  // with `source: "local"` and carry their own title / due date / course.
  // Nothing here round-trips to the Canvas Planner.
  todos: defineTable({
    userId: v.string(),
    source: v.union(v.literal("canvas"), v.literal("local")),
    canvasKind: v.optional(todoCanvasKind),
    canvasId: v.optional(v.number()),
    courseCanvasId: v.optional(v.number()),
    // Local tasks only; Canvas items take these from the mirror row.
    title: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    // Calendar day in the user's zone, "YYYY-MM-DD". Day-keyed on purpose:
    // a plan is "Friday", not an instant, and must not shift with DST.
    plannedDay: v.optional(v.string()),
    subtasks: v.array(subtask),
    notes: v.optional(v.string()),
    doneAt: v.optional(v.number()),
    // Set when the sync marked it done on submission, so the UI can say so.
    doneBySubmission: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_canvas", ["userId", "canvasKind", "canvasId"]),

  // Local-only course presentation: colour, nickname, order, hidden.
  coursePrefs: defineTable({
    userId: v.string(),
    courseCanvasId: v.number(),
    color: v.optional(courseColor),
    nickname: v.optional(v.string()),
    position: v.optional(v.number()),
    hidden: v.optional(v.boolean()),
  }).index("by_user_course", ["userId", "courseCanvasId"]),

  // One row per kind + canvasId. For assignment changes, seenVersion is the
  // newest changedAt acknowledged.
  seenState: defineTable({
    userId: v.string(),
    kind: entityKind,
    canvasId: v.number(),
    seenAt: v.number(),
    // For grades: the `postedAt`/`score` seen, so a regrade shows as new.
    seenVersion: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_kind", ["userId", "kind"])
    .index("by_user_kind_canvasId", ["userId", "kind", "canvasId"])
    .index("by_user_seenAt", ["userId", "seenAt"]),
});
