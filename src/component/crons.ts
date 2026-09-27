// Hourly sweep of expired locks, kv rows, list entries, and queue entries.
// A run that hits a full batch schedules another run right away, so large
// backlogs drain instead of piling up at one batch per hour.

import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";

// Rows deleted per table per run. Small enough to stay well inside Convex's
// per-mutation limits even when list entries hold full serialized messages.
const BATCH = 200;

export const cleanupExpired = internalMutation({
  args: {},
  returns: v.null(),
  // Explicit return type: the handler references `internal.crons` (this file),
  // which would otherwise make the inferred type circular.
  handler: async (ctx): Promise<null> => {
    const now = Date.now();
    let hasMore = false;

    for (const table of ["locks", "kv", "lists", "queues"] as const) {
      // The lower bound matters. Rows stored without a TTL have no
      // `expiresAt`, and a missing value sorts before every number, so
      // `lte(now)` alone would match them and could fill the whole batch with
      // rows that never expire, starving the real expired rows.
      const expired = await ctx.db
        .query(table)
        .withIndex("by_expires", (q) =>
          q.gte("expiresAt", 0).lte("expiresAt", now)
        )
        .take(BATCH);
      for (const row of expired) {
        await ctx.db.delete(row._id);
      }
      if (expired.length === BATCH) {
        hasMore = true;
      }
    }

    // Every inbound message writes a dedupe key, so a busy bot can expire
    // more than one batch per hour. Keep going until the backlog is gone.
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.crons.cleanupExpired, {});
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
