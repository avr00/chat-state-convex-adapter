import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

export const subscribe = mutation({
  args: {
    keyPrefix: v.string(),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { keyPrefix, threadId }) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_prefix_thread", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("subscriptions", { keyPrefix, threadId });
    }
    return null;
  },
});

export const unsubscribe = mutation({
  args: {
    keyPrefix: v.string(),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { keyPrefix, threadId }) => {
    const existing = await ctx.db
      .query("subscriptions")
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

export const isSubscribed = query({
  args: {
    keyPrefix: v.string(),
    threadId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { keyPrefix, threadId }) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_prefix_thread", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("threadId", threadId)
      )
      .unique();
    return existing !== null;
  },
});
