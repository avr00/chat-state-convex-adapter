/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api as componentApi } from "../component/_generated/api.js";
import schema from "../component/schema.js";
import {
  type ChatStateApi,
  type ConvexClientLike,
  createConvexState,
} from "./index.js";

const modules = import.meta.glob("../component/**/*.*s");

/**
 * The adapter calls `client.mutation(api.x, args)` where `api` is the
 * user's wrapper `ChatStateApi`. In tests we bypass the wrappers and
 * route directly to the component functions, since the wrappers are
 * straight forwarders. The fake `api` holds component function refs
 * and the fake client invokes them via convex-test.
 */
function buildHarness() {
  const t = convexTest(schema, modules);

  const api: ChatStateApi = {
    subscribe: componentApi.subscriptions
      .subscribe as unknown as ChatStateApi["subscribe"],
    unsubscribe: componentApi.subscriptions
      .unsubscribe as unknown as ChatStateApi["unsubscribe"],
    isSubscribed: componentApi.subscriptions
      .isSubscribed as unknown as ChatStateApi["isSubscribed"],
    acquireLock: componentApi.locks
      .acquireLock as unknown as ChatStateApi["acquireLock"],
    releaseLock: componentApi.locks
      .releaseLock as unknown as ChatStateApi["releaseLock"],
    forceReleaseLock: componentApi.locks
      .forceReleaseLock as unknown as ChatStateApi["forceReleaseLock"],
    extendLock: componentApi.locks
      .extendLock as unknown as ChatStateApi["extendLock"],
    kvGet: componentApi.kv.get as unknown as ChatStateApi["kvGet"],
    kvSet: componentApi.kv.set as unknown as ChatStateApi["kvSet"],
    kvSetIfNotExists: componentApi.kv
      .setIfNotExists as unknown as ChatStateApi["kvSetIfNotExists"],
    kvDelete: componentApi.kv.del as unknown as ChatStateApi["kvDelete"],
    appendToList: componentApi.lists
      .appendToList as unknown as ChatStateApi["appendToList"],
    getList: componentApi.lists.getList as unknown as ChatStateApi["getList"],
    enqueue: componentApi.queues
      .enqueue as unknown as ChatStateApi["enqueue"],
    dequeue: componentApi.queues
      .dequeue as unknown as ChatStateApi["dequeue"],
    queueDepth: componentApi.queues
      .queueDepth as unknown as ChatStateApi["queueDepth"],
  };

  // Mocking the full ConvexHttpClient / ConvexClient class surface is
  // unreasonable in unit tests, so we expose just the two methods the adapter
  // needs and cast. The production type of `ConvexClientLike` remains strict
  // (ConvexClient | ConvexHttpClient) so users get full type-checking.
  const client = {
    mutation: <M extends FunctionReference<"mutation">>(
      ref: M,
      args: FunctionArgs<M>
    ) =>
      t.mutation(
        ref as FunctionReference<"mutation">,
        args as Record<string, unknown>
      ) as Promise<FunctionReturnType<M>>,
    query: <Q extends FunctionReference<"query">>(
      ref: Q,
      args: FunctionArgs<Q>
    ) =>
      t.query(
        ref as FunctionReference<"query">,
        args as Record<string, unknown>
      ) as Promise<FunctionReturnType<Q>>,
  } as unknown as ConvexClientLike;

  return { t, api, client };
}

describe("ConvexStateAdapter", () => {
  describe("connect/disconnect lifecycle", () => {
    test("throws if used before connect", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await expect(adapter.subscribe("t1")).rejects.toThrow(/not connected/);
    });

    test("after connect, ops work", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      await adapter.subscribe("t1");
      expect(await adapter.isSubscribed("t1")).toBe(true);
    });

    test("after disconnect, ops throw", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      await adapter.disconnect();
      await expect(adapter.subscribe("t1")).rejects.toThrow(/not connected/);
    });
  });

  describe("subscriptions", () => {
    test("subscribe + isSubscribed", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      await adapter.subscribe("slack:C:1.1");
      expect(await adapter.isSubscribed("slack:C:1.1")).toBe(true);
    });

    test("unsubscribe", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      await adapter.subscribe("t1");
      await adapter.unsubscribe("t1");
      expect(await adapter.isSubscribed("t1")).toBe(false);
    });
  });

  describe("locks", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test("acquire + release + reacquire", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      const lock = await adapter.acquireLock("t1", 5000);
      expect(lock).not.toBeNull();
      await adapter.releaseLock(lock!);
      const lock2 = await adapter.acquireLock("t1", 5000);
      expect(lock2).not.toBeNull();
      expect(lock2!.token).not.toBe(lock!.token);
    });

    test("double acquire rejected", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      const lock1 = await adapter.acquireLock("t1", 5000);
      const lock2 = await adapter.acquireLock("t1", 5000);
      expect(lock1).not.toBeNull();
      expect(lock2).toBeNull();
    });

    test("release with wrong token is a no-op", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      const lock = await adapter.acquireLock("t1", 5000);
      await adapter.releaseLock({
        threadId: "t1",
        token: "fake",
        expiresAt: Date.now() + 5000,
      });
      const lock2 = await adapter.acquireLock("t1", 5000);
      expect(lock2).toBeNull();
      // cleanup
      await adapter.releaseLock(lock!);
    });

    test("extendLock keeps lock held past original TTL", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      const lock = await adapter.acquireLock("t1", 100);
      expect(await adapter.extendLock(lock!, 5000)).toBe(true);
      vi.advanceTimersByTime(200);
      const lock2 = await adapter.acquireLock("t1", 5000);
      expect(lock2).toBeNull();
    });

    test("forceReleaseLock bypasses token", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      await adapter.acquireLock("t1", 5000);
      await adapter.forceReleaseLock("t1");
      const lock2 = await adapter.acquireLock("t1", 5000);
      expect(lock2).not.toBeNull();
    });

    test("expired lock releases automatically", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      await adapter.acquireLock("t1", 10);
      vi.advanceTimersByTime(50);
      const lock2 = await adapter.acquireLock("t1", 5000);
      expect(lock2).not.toBeNull();
    });
  });

  describe("kv", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test("set + get round-trips JSON", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      await adapter.set("k", { hello: "world", n: 42 });
      expect(await adapter.get<{ hello: string; n: number }>("k")).toEqual({
        hello: "world",
        n: 42,
      });
    });

    test("setIfNotExists", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      expect(await adapter.setIfNotExists("k", "first")).toBe(true);
      expect(await adapter.setIfNotExists("k", "second")).toBe(false);
      expect(await adapter.get("k")).toBe("first");
    });

    test("delete removes key", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      await adapter.set("k", "v");
      await adapter.delete("k");
      expect(await adapter.get("k")).toBeNull();
    });

    test("ttl expires value", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      await adapter.set("k", "v", 10);
      vi.advanceTimersByTime(20);
      expect(await adapter.get("k")).toBeNull();
    });
  });

  describe("lists", () => {
    test("append and read round-trip structured values", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      await adapter.appendToList("L", { id: 1 });
      await adapter.appendToList("L", { id: 2 });
      expect(await adapter.getList<{ id: number }>("L")).toEqual([
        { id: 1 },
        { id: 2 },
      ]);
    });

    test("maxLength trims oldest", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      for (let i = 1; i <= 5; i++) {
        await adapter.appendToList("L", i, { maxLength: 3 });
      }
      expect(await adapter.getList<number>("L")).toEqual([3, 4, 5]);
    });
  });

  describe("queues", () => {
    test("enqueue + dequeue round-trips a QueueEntry", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      const now = Date.now();
      const entry = {
        enqueuedAt: now,
        expiresAt: now + 60_000,
        // minimal Message shape — QueueEntry.message carries whatever the
        // adapter put in. We don't exercise the Message type here.
        message: { text: "hi" } as never,
      };
      const depth = await adapter.enqueue("T", entry, 10);
      expect(depth).toBe(1);
      const out = await adapter.dequeue("T");
      expect(out?.message).toEqual({ text: "hi" });
    });

    test("dequeue on empty returns null", async () => {
      const { api, client } = buildHarness();
      const adapter = createConvexState({ client, api });
      await adapter.connect();
      expect(await adapter.dequeue("T")).toBeNull();
    });
  });
});
