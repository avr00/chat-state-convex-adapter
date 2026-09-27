// Ordered, append-only lists backing the Chat SDK's appendToList/getList
// (thread history cache for persistThreadHistory adapters, per-user transcripts).

import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { expiresAtFromTtl, isExpired } from "./expiry.js";

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
    const expiresAt = expiresAtFromTtl(now, ttlMs);

    const rows = await ctx.db
      .query("lists")
      .withIndex("by_prefix_key_seq", (q) =>
        q.eq("keyPrefix", keyPrefix).eq("listKey", listKey)
      )
      .order("asc")
      .collect();
    const seq = (rows.at(-1)?.seq ?? 0) + 1;

    // Readers already treat expired entries as gone. Delete them here so the
    // TTL refresh below can't bring them back before the cleanup cron runs.
    const live: typeof rows = [];
    for (const row of rows) {
      if (isExpired(row.expiresAt, now)) {
        await ctx.db.delete(row._id);
      } else {
        live.push(row);
      }
    }

    await ctx.db.insert("lists", {
      keyPrefix,
      listKey,
      seq,
      value,
      expiresAt,
    });

    // Keep the newest `maxLength` entries, counting the one just inserted.
    // `maxLength: 1` is how the SDK's transcript delete writes its tombstone.
    let kept = live;
    if (maxLength !== undefined && maxLength > 0) {
      const excess = live.length + 1 - maxLength;
      if (excess > 0) {
        for (const row of live.slice(0, excess)) {
          await ctx.db.delete(row._id);
        }
        kept = live.slice(excess);
      }
    }

    // The TTL applies to the whole list, so refresh it on every remaining
    // entry (same as Redis PEXPIRE on the list key and state-pg's UPDATE).
    if (expiresAt !== undefined) {
      for (const row of kept) {
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
    return rows.filter((r) => !isExpired(r.expiresAt, now)).map((r) => r.value);
  },
});
