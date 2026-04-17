import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

export const appendToList = mutation({
  args: {
    keyPrefix: v.string(),
    listKey: v.string(),
    value: v.string(),
    maxLength: v.optional(v.number()),
    ttlMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { keyPrefix, listKey, value, maxLength, ttlMs }) => {
    const now = Date.now();
    const expiresAt = ttlMs !== undefined ? now + ttlMs : undefined;

    const highest = await ctx.db
      .query("lists")
      .withIndex("by_prefix_key_seq", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("listKey", listKey)
      )
      .order("desc")
      .first();
    const seq = (highest?.seq ?? 0) + 1;

    await ctx.db.insert("lists", {
      keyPrefix,
      listKey,
      seq,
      value,
      expiresAt,
    });

    // Trim overflow — keep newest `maxLength` entries
    if (maxLength !== undefined && maxLength > 0) {
      const all = await ctx.db
        .query("lists")
        .withIndex("by_prefix_key_seq", (q) =>
          q.eq("keyPrefix", keyPrefix).eq("listKey", listKey)
        )
        .order("asc")
        .collect();
      const excess = all.length - maxLength;
      for (let i = 0; i < excess; i++) {
        const row = all[i];
        if (row) await ctx.db.delete(row._id);
      }
    }

    // Refresh TTL on all remaining entries for this key (matches state-pg)
    if (expiresAt !== undefined) {
      const remaining = await ctx.db
        .query("lists")
        .withIndex("by_prefix_key_seq", (q) =>
          q.eq("keyPrefix", keyPrefix).eq("listKey", listKey)
        )
        .collect();
      for (const row of remaining) {
        if (row.expiresAt !== expiresAt) {
          await ctx.db.patch(row._id, { expiresAt });
        }
      }
    }
    return null;
  },
});

export const getList = query({
  args: {
    keyPrefix: v.string(),
    listKey: v.string(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { keyPrefix, listKey }) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("lists")
      .withIndex("by_prefix_key_seq", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("listKey", listKey)
      )
      .order("asc")
      .collect();
    return rows
      .filter((r) => r.expiresAt === undefined || r.expiresAt > now)
      .map((r) => r.value);
  },
});
