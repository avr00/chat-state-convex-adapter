import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

const queueEntryReturn = v.object({
  value: v.string(),
  expiresAt: v.number(),
});

export const enqueue = mutation({
  args: {
    keyPrefix: v.string(),
    threadId: v.string(),
    value: v.string(),
    expiresAt: v.number(),
    maxSize: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, { keyPrefix, threadId, value, expiresAt, maxSize }) => {
    const now = Date.now();

    const expired = await ctx.db
      .query("queues")
      .withIndex("by_prefix_thread_seq", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .filter((q) => q.lte(q.field("expiresAt"), now))
      .collect();
    for (const row of expired) await ctx.db.delete(row._id);

    const highest = await ctx.db
      .query("queues")
      .withIndex("by_prefix_thread_seq", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .order("desc")
      .first();
    const seq = (highest?.seq ?? 0) + 1;

    await ctx.db.insert("queues", {
      keyPrefix,
      threadId,
      seq,
      value,
      expiresAt,
    });

    if (maxSize > 0) {
      const all = await ctx.db
        .query("queues")
        .withIndex("by_prefix_thread_seq", (q) =>
          q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
        )
        .order("asc")
        .collect();
      const excess = all.length - maxSize;
      for (let i = 0; i < excess; i++) {
        const row = all[i];
        if (row) await ctx.db.delete(row._id);
      }
    }

    const remaining = await ctx.db
      .query("queues")
      .withIndex("by_prefix_thread_seq", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .collect();
    return remaining.length;
  },
});

export const dequeue = mutation({
  args: {
    keyPrefix: v.string(),
    threadId: v.string(),
  },
  returns: v.union(queueEntryReturn, v.null()),
  handler: async (ctx, { keyPrefix, threadId }) => {
    const now = Date.now();

    const expired = await ctx.db
      .query("queues")
      .withIndex("by_prefix_thread_seq", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .filter((q) => q.lte(q.field("expiresAt"), now))
      .collect();
    for (const row of expired) await ctx.db.delete(row._id);

    const oldest = await ctx.db
      .query("queues")
      .withIndex("by_prefix_thread_seq", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .order("asc")
      .first();

    if (!oldest) return null;

    await ctx.db.delete(oldest._id);
    return { value: oldest.value, expiresAt: oldest.expiresAt };
  },
});

export const queueDepth = query({
  args: {
    keyPrefix: v.string(),
    threadId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, { keyPrefix, threadId }) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("queues")
      .withIndex("by_prefix_thread_seq", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .collect();
    return rows.filter((r) => r.expiresAt > now).length;
  },
});
