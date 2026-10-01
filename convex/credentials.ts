// The seam between "who is this user" (Clerk) and "how do we reach Canvas".
// Everything below `getCanvasClient` works the same whether the credential
// is a manually issued token (Phase 1) or an OAuth grant (Phase 3, once
// UW-Madison issues a developer key). Nothing outside this file may read
// or decrypt tokens.

import { v, type Infer } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { decryptSecret, encryptSecret } from "./lib/crypto";
import { CanvasClient } from "./canvas/client";
import type { CanvasUser } from "./canvas/types";
import { ensureSyncSchedule, removeSyncSchedule } from "./syncSchedule";
import { DISPATCH_TICK_MS } from "./lib/syncCadence";

const DEFAULT_INSTANCE = "canvas.wisc.edu";

/**
 * Connect a Canvas account with a manually issued access token (Phase 1).
 * The token is verified against Canvas before it is stored, then encrypted.
 * Note: multi-user deployments must use OAuth2 — a manual token is only
 * acceptable for the developer's own account (Canvas API Policy).
 */
export const connect = action({
  args: {
    token: v.string(),
    instance: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const instance = (args.instance ?? DEFAULT_INSTANCE)
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    const token = args.token.trim();

    // Verify the token works before we store anything.
    const probe = new CanvasClient({ instance, accessToken: token });
    const self = await probe.get<CanvasUser>("/users/self");

    const accessTokenEncrypted = await encryptSecret(token);
    await ctx.runMutation(internal.credentials.save, {
      userId,
      instance,
      canvasUserId: self.id,
      canvasUserName: self.name,
      accessTokenEncrypted,
    });
    await ctx.runMutation(internal.sync.enqueueFullSync, { userId });
    return null;
  },
});

export const save = internalMutation({
  args: {
    userId: v.string(),
    instance: v.string(),
    canvasUserId: v.number(),
    canvasUserName: v.string(),
    accessTokenEncrypted: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("canvasCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const fields = {
      instance: args.instance,
      kind: "manual" as const,
      canvasUserId: args.canvasUserId,
      canvasUserName: args.canvasUserName,
      accessTokenEncrypted: args.accessTokenEncrypted,
      status: "active" as const,
      revision: (existing?.revision ?? 0) + 1,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("canvasCredentials", { userId: args.userId, ...fields });
    }

    const syncState = await ctx.db
      .query("syncState")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!syncState) {
      await ctx.db.insert("syncState", { userId: args.userId, status: "idle" });
    }
    // The caller enqueues a full sync now; the tripwire starts a tick later.
    await ensureSyncSchedule(ctx, args.userId, { dueAt: Date.now() + DISPATCH_TICK_MS });
    return null;
  },
});

/** Connection status for the settings page. Never returns token material. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const credential = await ctx.db
      .query("canvasCredentials")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .unique();
    if (!credential) return { connected: false as const };
    const syncState = await ctx.db
      .query("syncState")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .unique();
    return {
      connected: true as const,
      instance: credential.instance,
      kind: credential.kind,
      canvasUserName: credential.canvasUserName,
      credentialStatus: credential.status,
      expiresAt: credential.expiresAt,
      sync: syncState
        ? {
            status: syncState.status,
            lastTripwireAt: syncState.lastTripwireAt,
            lastDeltaSyncAt: syncState.lastDeltaSyncAt,
            lastFullSyncAt: syncState.lastFullSyncAt,
            lastError: syncState.lastError,
          }
        : null,
    };
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const credential = await ctx.db
      .query("canvasCredentials")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (credential) await ctx.db.delete(credential._id);
    await removeSyncSchedule(ctx, userId);
    const interpretations = await ctx.db.query("courseInterpretations").withIndex("by_user_course", q => q.eq("userId", userId)).paginate({ cursor: null, numItems: 100 });
    for (const state of interpretations.page) await ctx.db.patch(state._id, { enabled: false, generation: state.generation + 1, status: state.map ? "ready" : "stale" });
    if (!interpretations.isDone) await ctx.scheduler.runAfter(0, internal.courseInterpretations.disableUser, { userId, cursor: interpretations.continueCursor });
    return null;
  },
});

export const getForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args): Promise<Doc<"canvasCredentials"> | null> => {
    return await ctx.db
      .query("canvasCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Exactly one stored token: the credential row and its revision. Convex never
 * reuses a document id, so a row deleted by `disconnect` and created again at
 * revision 1 still differs. Not secret.
 */
export const credentialIdentity = v.object({ credentialId: v.id("canvasCredentials"), revision: v.number() });
export type CredentialIdentity = Infer<typeof credentialIdentity>;

/**
 * Canvas rejected the token identified by `credential`. Marks it invalid and
 * takes the user out of the tripwire queue only if it is still the stored
 * token: a request that started before a reconnect (or a disconnect and new
 * connect) must not invalidate its replacement. Returns whether it marked.
 */
export const markInvalid = internalMutation({
  args: { userId: v.string(), credential: credentialIdentity },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("canvasCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (
      current === null ||
      current._id !== args.credential.credentialId ||
      (current.revision ?? 0) !== args.credential.revision
    ) {
      return false;
    }
    await ctx.db.patch(current._id, { status: "invalid" });
    await removeSyncSchedule(ctx, args.userId);
    return true;
  },
});

/** Whether the user can reach Canvas right now. Never exposes token material. */
export async function credentialState(
  ctx: QueryCtx,
  userId: string,
): Promise<"active" | "invalid" | "missing"> {
  const credential = await ctx.db
    .query("canvasCredentials")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return credential === null ? "missing" : credential.status;
}

/**
 * The user has no usable Canvas credential: never connected, disconnected,
 * or rejected by Canvas. Only reconnecting in Settings fixes it, so callers
 * report it rather than retry.
 */
export class CanvasReconnectRequired extends Error {
  constructor(public readonly reason: "missing" | "invalid") {
    super(reason === "missing" ? "Canvas is not connected" : "Canvas needs to be reconnected");
    this.name = "CanvasReconnectRequired";
  }
}

export interface CanvasSession {
  client: CanvasClient;
  credential: Doc<"canvasCredentials">;
  /** Which stored token this client uses; pass it to `markInvalid`. */
  identity: CredentialIdentity;
  /** Latest X-Rate-Limit-Remaining seen on this session, if any. */
  rateLimitRemaining: () => number | undefined;
}

/**
 * The single entry point for reaching Canvas on behalf of a user.
 * Actions only (decryption needs Web Crypto). Throws CanvasReconnectRequired
 * without a usable credential. A CanvasAuthError from a request means Canvas
 * rejected the token: run `internal.credentials.markInvalid` with the
 * session's `identity`.
 */
export async function getCanvasClient(
  ctx: ActionCtx,
  userId: string,
): Promise<CanvasSession> {
  const credential = await ctx.runQuery(internal.credentials.getForUser, {
    userId,
  });
  if (!credential) throw new CanvasReconnectRequired("missing");
  if (credential.status !== "active") throw new CanvasReconnectRequired("invalid");

  // Phase 3 (OAuth): when kind === "oauth" and expiresAt is within a skew
  // window, refresh via /login/oauth2/token here and persist the new token
  // before returning the client.

  const accessToken = await decryptSecret(credential.accessTokenEncrypted);
  let remaining: number | undefined;
  const client = new CanvasClient({
    instance: credential.instance,
    accessToken,
    onRateLimitRemaining: (value) => {
      remaining = value;
    },
  });
  return {
    client,
    credential,
    identity: { credentialId: credential._id, revision: credential.revision ?? 0 },
    rateLimitRemaining: () => remaining,
  };
}
