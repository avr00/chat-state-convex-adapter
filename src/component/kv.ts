import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

export const get = query({
  args: {
    keyPrefix: v.string(),
    cacheKey: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { keyPrefix, cacheKey }) => {
    const row = await ctx.db
      .query("kv")
      .withIndex("by_prefix_key", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("cacheKey", cacheKey)
      )
      .unique();

    if (!row) return null;
    if (row.expiresAt !== undefined && row.expiresAt <= Date.now()) {
      // Lazy expire is a mutation concern; query can't write. Caller's adapter
      // treats expired rows as missing; cleanup cron removes them.
      return null;
    }
    return row.value;
  },
});

export const set = mutation({
  args: {
    keyPrefix: v.string(),
    cacheKey: v.string(),
    value: v.string(),
    ttlMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { keyPrefix, cacheKey, value, ttlMs }) => {
    const expiresAt = ttlMs !== undefined ? Date.now() + ttlMs : undefined;
    const existing = await ctx.db
      .query("kv")
      .withIndex("by_prefix_key", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("cacheKey", cacheKey)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { value, expiresAt });
    } else {
      await ctx.db.insert("kv", { keyPrefix, cacheKey, value, expiresAt });
    }
    return null;
  },
});

export const setIfNotExists = mutation({
  args: {
    keyPrefix: v.string(),
    cacheKey: v.string(),
    value: v.string(),
    ttlMs: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, { keyPrefix, cacheKey, value, ttlMs }) => {
    const existing = await ctx.db
      .query("kv")
      .withIndex("by_prefix_key", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("cacheKey", cacheKey)
      )
      .unique();

    const now = Date.now();
    const isLive =
      existing !== null &&
      (existing.expiresAt === undefined || existing.expiresAt > now);

    if (isLive) return false;

    const expiresAt = ttlMs !== undefined ? now + ttlMs : undefined;
    if (existing) {
      await ctx.db.patch(existing._id, { value, expiresAt });
    } else {
      await ctx.db.insert("kv", { keyPrefix, cacheKey, value, expiresAt });
    }
    return true;
  },
});

export const del = mutation({
  args: {
    keyPrefix: v.string(),
    cacheKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { keyPrefix, cacheKey }) => {
    const existing = await ctx.db
      .query("kv")
      .withIndex("by_prefix_key", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("cacheKey", cacheKey)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});
