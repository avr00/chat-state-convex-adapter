import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api.js";
import schema from "./schema.js";
import { modules } from "./setup.test.js";

const KP = "chat-sdk";

describe("crons.cleanupExpired", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("deletes expired locks, kv, lists, and queues rows", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    // Expired lock
    await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 10,
      token: "x",
    });
    // Expired kv
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "k",
      value: "v",
      ttlMs: 10,
    });
    // Expired list entry
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "x",
      ttlMs: 10,
    });
    // Expired queue entry
    await t.mutation(api.queues.enqueue, {
      keyPrefix: KP,
      threadId: "q1",
      value: "m",
      expiresAt: now + 10,
      maxSize: 10,
    });

    vi.advanceTimersByTime(100);

    await t.mutation(internal.crons.cleanupExpired, {});

    const counts = await t.run(async (ctx) => ({
      locks: (await ctx.db.query("locks").collect()).length,
      kv: (await ctx.db.query("kv").collect()).length,
      lists: (await ctx.db.query("lists").collect()).length,
      queues: (await ctx.db.query("queues").collect()).length,
    }));
    expect(counts).toEqual({ locks: 0, kv: 0, lists: 0, queues: 0 });
  });

  test("leaves live rows alone", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 60_000,
      token: "x",
    });
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "k",
      value: "v",
      ttlMs: 60_000,
    });
    await t.mutation(api.queues.enqueue, {
      keyPrefix: KP,
      threadId: "q1",
      value: "m",
      expiresAt: now + 60_000,
      maxSize: 10,
    });

    await t.mutation(internal.crons.cleanupExpired, {});

    const counts = await t.run(async (ctx) => ({
      locks: (await ctx.db.query("locks").collect()).length,
      kv: (await ctx.db.query("kv").collect()).length,
      queues: (await ctx.db.query("queues").collect()).length,
    }));
    expect(counts).toEqual({ locks: 1, kv: 1, queues: 1 });
  });
});
