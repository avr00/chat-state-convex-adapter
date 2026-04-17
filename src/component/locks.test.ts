import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { modules } from "./setup.test.js";

const KP = "chat-sdk";

describe("locks", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("acquire a fresh lock", async () => {
    const t = convexTest(schema, modules);
    const lock = await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-a",
    });
    expect(lock).not.toBeNull();
    expect(lock?.threadId).toBe("t1");
    expect(lock?.token).toBe("tok-a");
  });

  test("double acquire is rejected", async () => {
    const t = convexTest(schema, modules);
    const lock1 = await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-a",
    });
    const lock2 = await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-b",
    });
    expect(lock1).not.toBeNull();
    expect(lock2).toBeNull();
  });

  test("release allows re-acquire", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-a",
    });
    await t.mutation(api.locks.releaseLock, {
      keyPrefix: KP,
      threadId: "t1",
      token: "tok-a",
    });
    const lock2 = await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-b",
    });
    expect(lock2).not.toBeNull();
  });

  test("release with wrong token is a no-op", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-a",
    });
    await t.mutation(api.locks.releaseLock, {
      keyPrefix: KP,
      threadId: "t1",
      token: "wrong",
    });
    const lock2 = await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-c",
    });
    expect(lock2).toBeNull();
  });

  test("expired lock can be re-acquired", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 10,
      token: "tok-a",
    });
    vi.advanceTimersByTime(50);
    const lock2 = await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-b",
    });
    expect(lock2).not.toBeNull();
    expect(lock2?.token).toBe("tok-b");
  });

  test("extendLock succeeds with correct token", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 100,
      token: "tok-a",
    });
    const ok = await t.mutation(api.locks.extendLock, {
      keyPrefix: KP,
      threadId: "t1",
      token: "tok-a",
      ttlMs: 5000,
    });
    expect(ok).toBe(true);
    vi.advanceTimersByTime(150);
    const lock2 = await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-b",
    });
    expect(lock2).toBeNull();
  });

  test("extendLock fails with wrong token", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-a",
    });
    const ok = await t.mutation(api.locks.extendLock, {
      keyPrefix: KP,
      threadId: "t1",
      token: "wrong",
      ttlMs: 5000,
    });
    expect(ok).toBe(false);
  });

  test("extendLock fails on expired lock", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 10,
      token: "tok-a",
    });
    vi.advanceTimersByTime(50);
    const ok = await t.mutation(api.locks.extendLock, {
      keyPrefix: KP,
      threadId: "t1",
      token: "tok-a",
      ttlMs: 5000,
    });
    expect(ok).toBe(false);
  });

  test("forceReleaseLock bypasses token", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-a",
    });
    await t.mutation(api.locks.forceReleaseLock, {
      keyPrefix: KP,
      threadId: "t1",
    });
    const lock2 = await t.mutation(api.locks.acquireLock, {
      keyPrefix: KP,
      threadId: "t1",
      ttlMs: 5000,
      token: "tok-b",
    });
    expect(lock2).not.toBeNull();
  });

  test("forceReleaseLock on missing lock is a no-op", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.locks.forceReleaseLock, {
        keyPrefix: KP,
        threadId: "missing",
      })
    ).resolves.toBeNull();
  });
});
