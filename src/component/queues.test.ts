import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { modules } from "./setup.test.js";

const KP = "chat-sdk";
const FAR = 10 * 60 * 1000; // 10 minutes out

describe("queues", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("enqueue returns depth", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const d1 = await t.mutation(api.queues.enqueue, {
      keyPrefix: KP,
      threadId: "T",
      value: "m1",
      expiresAt: now + FAR,
      maxSize: 10,
    });
    const d2 = await t.mutation(api.queues.enqueue, {
      keyPrefix: KP,
      threadId: "T",
      value: "m2",
      expiresAt: now + FAR,
      maxSize: 10,
    });
    expect(d1).toBe(1);
    expect(d2).toBe(2);
  });

  test("dequeue is FIFO", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    for (const v of ["a", "b", "c"]) {
      await t.mutation(api.queues.enqueue, {
        keyPrefix: KP,
        threadId: "T",
        value: v,
        expiresAt: now + FAR,
        maxSize: 10,
      });
    }
    const first = await t.mutation(api.queues.dequeue, {
      keyPrefix: KP,
      threadId: "T",
    });
    const second = await t.mutation(api.queues.dequeue, {
      keyPrefix: KP,
      threadId: "T",
    });
    expect(first?.value).toBe("a");
    expect(second?.value).toBe("b");
  });

  test("dequeue on empty returns null", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.mutation(api.queues.dequeue, {
        keyPrefix: KP,
        threadId: "T",
      })
    ).toBeNull();
  });

  test("queueDepth tracks live entries", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.mutation(api.queues.enqueue, {
      keyPrefix: KP,
      threadId: "T",
      value: "a",
      expiresAt: now + FAR,
      maxSize: 10,
    });
    expect(
      await t.query(api.queues.queueDepth, {
        keyPrefix: KP,
        threadId: "T",
      })
    ).toBe(1);
  });

  test("maxSize trims oldest", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    for (const v of ["a", "b", "c", "d"]) {
      await t.mutation(api.queues.enqueue, {
        keyPrefix: KP,
        threadId: "T",
        value: v,
        expiresAt: now + FAR,
        maxSize: 2,
      });
    }
    const first = await t.mutation(api.queues.dequeue, {
      keyPrefix: KP,
      threadId: "T",
    });
    const second = await t.mutation(api.queues.dequeue, {
      keyPrefix: KP,
      threadId: "T",
    });
    const third = await t.mutation(api.queues.dequeue, {
      keyPrefix: KP,
      threadId: "T",
    });
    expect(first?.value).toBe("c");
    expect(second?.value).toBe("d");
    expect(third).toBeNull();
  });

  test("expired entries are skipped on dequeue", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.mutation(api.queues.enqueue, {
      keyPrefix: KP,
      threadId: "T",
      value: "stale",
      expiresAt: now + 100,
      maxSize: 10,
    });
    await t.mutation(api.queues.enqueue, {
      keyPrefix: KP,
      threadId: "T",
      value: "fresh",
      expiresAt: now + FAR,
      maxSize: 10,
    });
    vi.advanceTimersByTime(200);
    const out = await t.mutation(api.queues.dequeue, {
      keyPrefix: KP,
      threadId: "T",
    });
    expect(out?.value).toBe("fresh");
  });
});
