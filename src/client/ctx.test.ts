/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api as componentApi } from "../component/_generated/api.js";
import type { ComponentApi } from "../component/_generated/component.js";
import schema from "../component/schema.js";
import { createConvexStateFromCtx, type RunComponentCtx } from "./ctx.js";

const modules = import.meta.glob("../component/**/*.*s");

/**
 * Builds a `RunComponentCtx` shim backed by convex-test. In production the
 * ctx comes from an action handler. Its `runMutation`/`runQuery` receive
 * *component* function refs and so are typed as `"internal"`, matching
 * what Convex would produce in a real app.
 */
function buildHarness() {
  const t = convexTest(schema, modules);

  const ctx: RunComponentCtx = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runMutation: (ref: any, args: any) => t.mutation(ref, args) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runQuery: (ref: any, args: any) => t.query(ref, args) as any,
  };

  // componentApi (with `public` refs from the component's own generated api)
  // is structurally interchangeable with the ComponentApi type that the
  // installing app's `components.chatState` would have.
  const component = componentApi as unknown as ComponentApi;

  return { t, ctx, component };
}

describe("ConvexCtxStateAdapter", () => {
  test("throws if used before connect", async () => {
    const { ctx, component } = buildHarness();
    const adapter = createConvexStateFromCtx({ ctx, component });
    await expect(adapter.subscribe("t1")).rejects.toThrow(/not connected/);
  });

  test("subscribe + isSubscribed round-trip", async () => {
    const { ctx, component } = buildHarness();
    const adapter = createConvexStateFromCtx({ ctx, component });
    await adapter.connect();
    await adapter.subscribe("t1");
    expect(await adapter.isSubscribed("t1")).toBe(true);
    await adapter.unsubscribe("t1");
    expect(await adapter.isSubscribed("t1")).toBe(false);
  });

  describe("locks", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test("acquire / release / reacquire with distinct tokens", async () => {
      const { ctx, component } = buildHarness();
      const adapter = createConvexStateFromCtx({ ctx, component });
      await adapter.connect();
      const lock = await adapter.acquireLock("t1", 5000);
      expect(lock).not.toBeNull();
      await adapter.releaseLock(lock!);
      const lock2 = await adapter.acquireLock("t1", 5000);
      expect(lock2).not.toBeNull();
      expect(lock2!.token).not.toBe(lock!.token);
    });

    test("forceReleaseLock bypasses token", async () => {
      const { ctx, component } = buildHarness();
      const adapter = createConvexStateFromCtx({ ctx, component });
      await adapter.connect();
      await adapter.acquireLock("t1", 5000);
      await adapter.forceReleaseLock("t1");
      const lock2 = await adapter.acquireLock("t1", 5000);
      expect(lock2).not.toBeNull();
    });
  });

  test("kv set/get round-trips JSON", async () => {
    const { ctx, component } = buildHarness();
    const adapter = createConvexStateFromCtx({ ctx, component });
    await adapter.connect();
    await adapter.set("k", { hello: "world" });
    expect(await adapter.get("k")).toEqual({ hello: "world" });
  });

  test("queue FIFO via ctx", async () => {
    const { ctx, component } = buildHarness();
    const adapter = createConvexStateFromCtx({ ctx, component });
    await adapter.connect();
    const now = Date.now();
    const entry = {
      enqueuedAt: now,
      expiresAt: now + 60_000,
      message: { text: "hi" } as never,
    };
    const depth = await adapter.enqueue("T", entry, 10);
    expect(depth).toBe(1);
    const out = await adapter.dequeue("T");
    expect(out?.message).toEqual({ text: "hi" });
  });

  test("keyPrefix isolates state across bots", async () => {
    const { ctx, component } = buildHarness();
    const botA = createConvexStateFromCtx({ ctx, component, keyPrefix: "a" });
    const botB = createConvexStateFromCtx({ ctx, component, keyPrefix: "b" });
    await botA.connect();
    await botB.connect();
    await botA.subscribe("shared-thread");
    expect(await botA.isSubscribed("shared-thread")).toBe(true);
    expect(await botB.isSubscribed("shared-thread")).toBe(false);
  });
});
