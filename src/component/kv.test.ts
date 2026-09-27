import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { modules } from "./setup.test.js";

const KP = "chat-sdk";

describe("kv", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("set then get returns value", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "k",
      value: JSON.stringify({ hello: "world" }),
    });
    const v = await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "k" });
    expect(v).toBe(JSON.stringify({ hello: "world" }));
  });

  test("get missing key returns null", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "missing" })
    ).toBeNull();
  });

  test("set overwrites existing value", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "k",
      value: "v1",
    });
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "k",
      value: "v2",
    });
    expect(
      await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "k" })
    ).toBe("v2");
  });

  test("ttl expires value", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "k",
      value: "v",
      ttlMs: 10,
    });
    vi.advanceTimersByTime(20);
    expect(
      await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "k" })
    ).toBeNull();
  });

  test("ttlMs 0 means no expiry, like the official adapters", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "k",
      value: "v",
      ttlMs: 0,
    });
    vi.advanceTimersByTime(60_000);
    expect(
      await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "k" })
    ).toBe("v");
  });

  test("set without ttl clears a previous TTL", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "k",
      value: "v1",
      ttlMs: 10,
    });
    await t.mutation(api.kv.set, { keyPrefix: KP, cacheKey: "k", value: "v2" });
    vi.advanceTimersByTime(50);
    expect(
      await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "k" })
    ).toBe("v2");
  });

  test("delete removes the key", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.kv.set, {
      keyPrefix: KP,
      cacheKey: "k",
      value: "v",
    });
    await t.mutation(api.kv.del, { keyPrefix: KP, cacheKey: "k" });
    expect(
      await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "k" })
    ).toBeNull();
  });

  describe("setIfNotExists", () => {
    test("sets when key does not exist", async () => {
      const t = convexTest(schema, modules);
      const ok = await t.mutation(api.kv.setIfNotExists, {
        keyPrefix: KP,
        cacheKey: "k",
        value: "first",
      });
      expect(ok).toBe(true);
      expect(
        await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "k" })
      ).toBe("first");
    });

    test("does not overwrite an existing live key", async () => {
      const t = convexTest(schema, modules);
      await t.mutation(api.kv.setIfNotExists, {
        keyPrefix: KP,
        cacheKey: "k",
        value: "first",
      });
      const ok = await t.mutation(api.kv.setIfNotExists, {
        keyPrefix: KP,
        cacheKey: "k",
        value: "second",
      });
      expect(ok).toBe(false);
      expect(
        await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "k" })
      ).toBe("first");
    });

    test("overwrites after TTL expires", async () => {
      const t = convexTest(schema, modules);
      await t.mutation(api.kv.setIfNotExists, {
        keyPrefix: KP,
        cacheKey: "k",
        value: "first",
        ttlMs: 10,
      });
      vi.advanceTimersByTime(20);
      const ok = await t.mutation(api.kv.setIfNotExists, {
        keyPrefix: KP,
        cacheKey: "k",
        value: "second",
      });
      expect(ok).toBe(true);
      expect(
        await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "k" })
      ).toBe("second");
    });

    test("a key stored with ttlMs 0 is permanent and never re-claimed", async () => {
      const t = convexTest(schema, modules);
      await t.mutation(api.kv.setIfNotExists, {
        keyPrefix: KP,
        cacheKey: "k",
        value: "first",
        ttlMs: 0,
      });
      vi.advanceTimersByTime(60_000);
      const ok = await t.mutation(api.kv.setIfNotExists, {
        keyPrefix: KP,
        cacheKey: "k",
        value: "second",
      });
      expect(ok).toBe(false);
    });

    test("respects TTL on newly-set value", async () => {
      const t = convexTest(schema, modules);
      await t.mutation(api.kv.setIfNotExists, {
        keyPrefix: KP,
        cacheKey: "k",
        value: "v",
        ttlMs: 10,
      });
      vi.advanceTimersByTime(20);
      expect(
        await t.query(api.kv.get, { keyPrefix: KP, cacheKey: "k" })
      ).toBeNull();
    });
  });
});
