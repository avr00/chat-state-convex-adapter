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
