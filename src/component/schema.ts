import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  subscriptions: defineTable({
    keyPrefix: v.string(),
    threadId: v.string(),
  }).index("by_prefix_thread", ["keyPrefix", "threadId"]),

  locks: defineTable({
    keyPrefix: v.string(),
    threadId: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  })
    .index("by_prefix_thread", ["keyPrefix", "threadId"])
    .index("by_expires", ["expiresAt"]),

  kv: defineTable({
    keyPrefix: v.string(),
    cacheKey: v.string(),
    value: v.string(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_prefix_key", ["keyPrefix", "cacheKey"])
    .index("by_expires", ["expiresAt"]),

  lists: defineTable({
    keyPrefix: v.string(),
    listKey: v.string(),
    seq: v.number(),
    value: v.string(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_prefix_key_seq", ["keyPrefix", "listKey", "seq"])
    .index("by_expires", ["expiresAt"]),

  queues: defineTable({
    keyPrefix: v.string(),
    threadId: v.string(),
    seq: v.number(),
    value: v.string(),
    expiresAt: v.number(),
  })
    .index("by_prefix_thread_seq", ["keyPrefix", "threadId", "seq"])
    .index("by_expires", ["expiresAt"]),
});
