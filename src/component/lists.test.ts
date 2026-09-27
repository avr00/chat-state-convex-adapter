import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { modules } from "./setup.test.js";

const KP = "chat-sdk";

describe("lists", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("append then getList preserves insertion order", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "a",
    });
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "b",
    });
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "c",
    });
    expect(
      await t.query(api.lists.getList, { keyPrefix: KP, listKey: "L" })
    ).toEqual(["a", "b", "c"]);
  });

  test("getList on missing key returns empty array", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(api.lists.getList, { keyPrefix: KP, listKey: "none" })
    ).toEqual([]);
  });

  test("maxLength trims oldest, keeps newest", async () => {
    const t = convexTest(schema, modules);
    for (let i = 1; i <= 5; i++) {
      await t.mutation(api.lists.appendToList, {
        keyPrefix: KP,
        listKey: "L",
        value: String(i),
        maxLength: 3,
      });
    }
    expect(
      await t.query(api.lists.getList, { keyPrefix: KP, listKey: "L" })
    ).toEqual(["3", "4", "5"]);
  });

  test("TTL expires list entries", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "a",
      ttlMs: 10,
    });
    vi.advanceTimersByTime(20);
    expect(
      await t.query(api.lists.getList, { keyPrefix: KP, listKey: "L" })
    ).toEqual([]);
  });

  test("appending to an expired list starts fresh instead of reviving old entries", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "old",
      ttlMs: 10,
    });
    // Expired but not yet swept by the cleanup cron.
    vi.advanceTimersByTime(100);
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "new",
      ttlMs: 60_000,
    });
    expect(
      await t.query(api.lists.getList, { keyPrefix: KP, listKey: "L" })
    ).toEqual(["new"]);
    const rows = await t.run(async (ctx) => ctx.db.query("lists").collect());
    expect(rows.map((r) => r.value)).toEqual(["new"]);
  });

  test("maxLength 1 replaces the whole list (transcript delete tombstone)", async () => {
    const t = convexTest(schema, modules);
    for (let i = 1; i <= 4; i++) {
      await t.mutation(api.lists.appendToList, {
        keyPrefix: KP,
        listKey: "L",
        value: String(i),
        maxLength: 200,
      });
    }
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "tombstone",
      maxLength: 1,
    });
    expect(
      await t.query(api.lists.getList, { keyPrefix: KP, listKey: "L" })
    ).toEqual(["tombstone"]);
  });

  test("ttlMs 0 means no expiry, like the official adapters", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "a",
      ttlMs: 0,
    });
    vi.advanceTimersByTime(60_000);
    expect(
      await t.query(api.lists.getList, { keyPrefix: KP, listKey: "L" })
    ).toEqual(["a"]);
  });

  test("keyPrefix isolates lists with the same key", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.lists.appendToList, {
      keyPrefix: "a",
      listKey: "L",
      value: "from-a",
    });
    await t.mutation(api.lists.appendToList, {
      keyPrefix: "b",
      listKey: "L",
      value: "from-b",
      maxLength: 1,
    });
    expect(
      await t.query(api.lists.getList, { keyPrefix: "a", listKey: "L" })
    ).toEqual(["from-a"]);
  });

  test("subsequent appends refresh TTL on whole list", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "a",
      ttlMs: 50,
    });
    vi.advanceTimersByTime(30);
    await t.mutation(api.lists.appendToList, {
      keyPrefix: KP,
      listKey: "L",
      value: "b",
      ttlMs: 50,
    });
    expect(
      await t.query(api.lists.getList, { keyPrefix: KP, listKey: "L" })
    ).toEqual(["a", "b"]);
  });
});
