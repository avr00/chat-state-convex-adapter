import { v } from "convex/values";
import { mutation } from "./_generated/server.js";

const lockReturn = v.union(
  v.object({
    threadId: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  }),
  v.null()
);

export const acquireLock = mutation({
  args: {
    keyPrefix: v.string(),
    threadId: v.string(),
    ttlMs: v.number(),
    token: v.string(),
  },
  returns: lockReturn,
  handler: async (ctx, { keyPrefix, threadId, ttlMs, token }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("locks")
      .withIndex("by_prefix_thread", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .unique();

    if (existing && existing.expiresAt > now) {
      return null;
    }

    const expiresAt = now + ttlMs;

    if (existing) {
      await ctx.db.patch(existing._id, { token, expiresAt });
    } else {
      await ctx.db.insert("locks", { keyPrefix, threadId, token, expiresAt });
    }

    return { threadId, token, expiresAt };
  },
});

export const releaseLock = mutation({
  args: {
    keyPrefix: v.string(),
    threadId: v.string(),
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { keyPrefix, threadId, token }) => {
    const existing = await ctx.db
      .query("locks")
      .withIndex("by_prefix_thread", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .unique();

    if (existing && existing.token === token) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

export const forceReleaseLock = mutation({
  args: {
    keyPrefix: v.string(),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { keyPrefix, threadId }) => {
    const existing = await ctx.db
      .query("locks")
      .withIndex("by_prefix_thread", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

export const extendLock = mutation({
  args: {
    keyPrefix: v.string(),
    threadId: v.string(),
    token: v.string(),
    ttlMs: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, { keyPrefix, threadId, token, ttlMs }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("locks")
      .withIndex("by_prefix_thread", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .unique();

    if (!existing || existing.token !== token) return false;
    if (existing.expiresAt <= now) {
      // Expired — matches state-pg behavior: do not extend
      return false;
    }

    await ctx.db.patch(existing._id, { expiresAt: now + ttlMs });
    return true;
  },
});
