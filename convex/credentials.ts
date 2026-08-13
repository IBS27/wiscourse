// The seam between "who is this user" (Clerk) and "how do we reach Canvas".
// Everything below `getCanvasClient` works the same whether the credential
// is a manually issued token (Phase 1) or an OAuth grant (Phase 3, once
// UW-Madison issues a developer key). Nothing outside this file may read
// or decrypt tokens.

import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { decryptSecret, encryptSecret } from "./lib/crypto";
import { CanvasClient } from "./canvas/client";
import type { CanvasUser } from "./canvas/types";

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

export const markInvalid = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("canvasCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (credential) await ctx.db.patch(credential._id, { status: "invalid" });
    return null;
  },
});

export interface CanvasSession {
  client: CanvasClient;
  credential: Doc<"canvasCredentials">;
  /** Latest X-Rate-Limit-Remaining seen on this session, if any. */
  rateLimitRemaining: () => number | undefined;
}

/**
 * The single entry point for reaching Canvas on behalf of a user.
 * Actions only (decryption needs Web Crypto).
 */
export async function getCanvasClient(
  ctx: ActionCtx,
  userId: string,
): Promise<CanvasSession> {
  const credential = await ctx.runQuery(internal.credentials.getForUser, {
    userId,
  });
  if (!credential) {
    throw new Error(`No Canvas credential for user ${userId}`);
  }
  if (credential.status !== "active") {
    throw new Error(`Canvas credential for user ${userId} is ${credential.status}`);
  }

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
  return { client, credential, rateLimitRemaining: () => remaining };
}
