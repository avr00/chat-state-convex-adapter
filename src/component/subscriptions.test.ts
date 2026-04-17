import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { modules } from "./setup.test.js";

const KP = "chat-sdk";

describe("subscriptions", () => {
  test("subscribe then isSubscribed is true", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.subscriptions.subscribe, {
      keyPrefix: KP,
      threadId: "slack:C1:1.1",
    });
    expect(
      await t.query(api.subscriptions.isSubscribed, {
        keyPrefix: KP,
        threadId: "slack:C1:1.1",
      })
    ).toBe(true);
  });

  test("unsubscribe clears the subscription", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.subscriptions.subscribe, {
      keyPrefix: KP,
      threadId: "t1",
    });
    await t.mutation(api.subscriptions.unsubscribe, {
      keyPrefix: KP,
      threadId: "t1",
    });
    expect(
      await t.query(api.subscriptions.isSubscribed, {
        keyPrefix: KP,
        threadId: "t1",
      })
    ).toBe(false);
  });

  test("isSubscribed returns false when never subscribed", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(api.subscriptions.isSubscribed, {
        keyPrefix: KP,
        threadId: "never",
      })
    ).toBe(false);
  });

  test("subscribe is idempotent (no duplicate rows)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.subscriptions.subscribe, {
      keyPrefix: KP,
      threadId: "t1",
    });
    await t.mutation(api.subscriptions.subscribe, {
      keyPrefix: KP,
      threadId: "t1",
    });
    const count = await t.run(async (ctx) => {
      const rows = await ctx.db.query("subscriptions").collect();
      return rows.length;
    });
    expect(count).toBe(1);
  });

  test("keyPrefix isolates subscriptions", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.subscriptions.subscribe, {
      keyPrefix: "bot-a",
      threadId: "t1",
    });
    expect(
      await t.query(api.subscriptions.isSubscribed, {
        keyPrefix: "bot-b",
        threadId: "t1",
      })
    ).toBe(false);
  });
});
