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

  test("rows without a TTL don't starve the sweep", async () => {
    const t = convexTest(schema, modules);
    // More permanent rows than one batch. A missing `expiresAt` sorts before
    // every number, so an unbounded `lte(now)` range would return these first.
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++) {
        await ctx.db.insert("kv", { keyPrefix: KP, cacheKey: `p${i}`, value: "1" });
        await ctx.db.insert("lists", {
          keyPrefix: KP,
          listKey: "transcripts:user:u1",
          seq: i + 1,
          value: "1",
        });
      }
    });
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "dedupe",
      value: "true",
      ttlMs: 10,
    });
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "msg-history:t1",
      value: "m",
      ttlMs: 10,
    });
    vi.advanceTimersByTime(100);

    await t.mutation(internal.crons.cleanupExpired, {});

    const left = await t.run(async (ctx) => ({
      dedupe: await ctx.db
        .query("kv")
        .withIndex("by_prefix_key", (q) =>
          q.eq("keyPrefix", KP).eq("cacheKey", "dedupe")
        )
        .unique(),
      kv: (await ctx.db.query("kv").collect()).length,
      lists: (await ctx.db.query("lists").collect()).length,
    }));
    expect(left).toEqual({ dedupe: null, kv: 250, lists: 250 });
  });

  test("drains a backlog larger than one batch by rescheduling itself", async () => {
    const t = convexTest(schema, modules);
    const expiresAt = Date.now() + 10;
    await t.run(async (ctx) => {
      for (let i = 0; i < 450; i++) {
        await ctx.db.insert("kv", {
          keyPrefix: KP,
          cacheKey: `dedupe:${i}`,
          value: "true",
          expiresAt,
        });
      }
    });
    vi.advanceTimersByTime(100);

    await t.mutation(internal.crons.cleanupExpired, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const left = await t.run(
      async (ctx) => (await ctx.db.query("kv").collect()).length
    );
    expect(left).toBe(0);
  });

  test("does not reschedule when the backlog fits in one batch", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "k",
      value: "v",
      ttlMs: 10,
    });
    vi.advanceTimersByTime(100);

    await t.mutation(internal.crons.cleanupExpired, {});

    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    expect(scheduled).toEqual([]);
  });
});
