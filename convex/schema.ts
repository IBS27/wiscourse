import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
});

export default defineSchema({
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
    rateLimitRemaining: v.optional(v.number()),
    status: v.union(v.literal("idle"), v.literal("syncing"), v.literal("error")),
    lastError: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  courses: defineTable({
    userId: v.string(),
    canvasId: v.number(),
    name: v.string(),
    courseCode: v.string(),
    term: v.optional(v.string()),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    isFavorite: v.optional(v.boolean()),
    syncedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_canvasId", ["userId", "canvasId"]),

  assignments: defineTable({
    userId: v.string(),
    courseCanvasId: v.number(),
    canvasId: v.number(),
    name: v.string(),
    dueAt: v.optional(v.number()),
    pointsPossible: v.optional(v.number()),
    htmlUrl: v.string(),
    submissionTypes: v.array(v.string()),
    submission: v.optional(submissionFields),
    syncedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_dueAt", ["userId", "dueAt"]),

  announcements: defineTable({
    userId: v.string(),
    courseCanvasId: v.number(),
    canvasId: v.number(),
    title: v.string(),
    message: v.string(),
    postedAt: v.optional(v.number()),
    htmlUrl: v.string(),
    syncedAt: v.number(),
  })
    .index("by_user_canvasId", ["userId", "canvasId"])
    .index("by_user_postedAt", ["userId", "postedAt"]),

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

  tasks: defineTable({
    userId: v.string(),
    title: v.string(),
    details: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    courseCanvasId: v.optional(v.number()),
    source: v.union(v.literal("local"), v.literal("canvas")),
    canvasPlannerNoteId: v.optional(v.number()),
    syncedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_plannerNote", ["userId", "canvasPlannerNoteId"]),
});
