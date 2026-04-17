import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";

const BATCH = 200;

export const cleanupExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    for (const table of ["locks", "kv", "lists", "queues"] as const) {
      const expired = await ctx.db
        .query(table)
        .withIndex("by_expires", (q) => q.lte("expiresAt", now))
        .take(BATCH);
      for (const row of expired) {
        if (row.expiresAt !== undefined && row.expiresAt <= now) {
          await ctx.db.delete(row._id);
        }
      }
    }
    return null;
  },
});

const crons = cronJobs();
crons.interval(
  "chat-state cleanup expired rows",
  { minutes: 60 },
  internal.crons.cleanupExpired
);

export default crons;
