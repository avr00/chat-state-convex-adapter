/// <reference types="vite/client" />
// Runs Chat SDK's own history primitives (the thread history cache and the
// per-user transcript store behind `bot.history.user`) against this adapter,
// so a change in how the SDK drives appendToList/getList shows up here.
import { convexTest } from "convex-test";
import {
  HistoryApiImpl,
  Message,
  type Postable,
  ThreadHistoryCache,
  type TranscriptsConfig,
} from "chat";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api as componentApi } from "../component/_generated/api.js";
import type { ComponentApi } from "../component/_generated/component.js";
import schema from "../component/schema.js";
import { createConvexStateFromCtx, type RunComponentCtx } from "./ctx.js";

const modules = import.meta.glob("../component/**/*.*s");

async function connectedAdapter() {
  const t = convexTest(schema, modules);
  const ctx: RunComponentCtx = {
    // convex-test's typed `mutation`/`query` don't line up with the generic
    // RunComponentCtx signature; the refs are the component's own (same shim
    // as ctx.test.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runMutation: (ref: any, args: any) => t.mutation(ref, args) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runQuery: (ref: any, args: any) => t.query(ref, args) as any,
  };
  const state = createConvexStateFromCtx({
    ctx,
    component: componentApi as unknown as ComponentApi,
  });
  await state.connect();
  return state;
}

function makeMessage(id: string, text: string): Message {
  return new Message({
    id,
    threadId: "whatsapp:123:456",
    text,
    formatted: { type: "root", children: [] },
    raw: { big: "platform payload" },
    author: {
      userId: "u1",
      userName: "ada",
      fullName: "Ada",
      isBot: false,
      isMe: false,
    },
    metadata: { dateSent: new Date(0), edited: false },
    attachments: [],
  });
}

// Transcript appends only read `thread.adapter.name` and `thread.id`.
const thread = {
  adapter: { name: "slack" },
  id: "slack:C1:1700000000.000100",
} as unknown as Postable;

function userHistory(
  state: Awaited<ReturnType<typeof connectedAdapter>>,
  config: TranscriptsConfig = {}
) {
  return new HistoryApiImpl({
    adapterResolver: () => undefined,
    user: { config, state },
  }).user;
}

describe("Chat SDK history on the Convex adapter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("ThreadHistoryCache keeps the newest maxMessages, oldest first", async () => {
    const state = await connectedAdapter();
    const cache = new ThreadHistoryCache(state, { maxMessages: 2 });
    await cache.append("whatsapp:123:456", makeMessage("m1", "one"));
    await cache.append("whatsapp:123:456", makeMessage("m2", "two"));
    await cache.append("whatsapp:123:456", makeMessage("m3", "three"));

    const messages = await cache.getMessages("whatsapp:123:456");
    expect(messages.map((m) => m.text)).toEqual(["two", "three"]);
    expect(messages[0]).toBeInstanceOf(Message);
    // The cache strips raw payloads before storing them.
    expect(messages[0]?.raw).toBeNull();
  });

  test("ThreadHistoryCache TTL is refreshed by each append", async () => {
    const state = await connectedAdapter();
    const cache = new ThreadHistoryCache(state, { ttlMs: 1000 });
    await cache.append("t", makeMessage("m1", "one"));
    vi.advanceTimersByTime(800);
    await cache.append("t", makeMessage("m2", "two"));
    vi.advanceTimersByTime(800);
    expect((await cache.getMessages("t")).map((m) => m.text)).toEqual([
      "one",
      "two",
    ]);
    vi.advanceTimersByTime(300);
    expect(await cache.getMessages("t")).toEqual([]);
  });

  test("history.user append, list, count, and delete", async () => {
    const state = await connectedAdapter();
    const history = userHistory(state);
    for (const text of ["hi", "how are you", "bye"]) {
      await history.append(thread, { role: "user", text }, { userKey: "u1" });
    }
    await history.append(
      thread,
      { role: "assistant", text: "hello!" },
      { userKey: "u1" }
    );
    await history.append(thread, { role: "user", text: "other" }, { userKey: "u2" });

    expect(await history.count({ userKey: "u1" })).toBe(4);
    const assistant = await history.list({ userKey: "u1", roles: ["assistant"] });
    expect(assistant.map((e) => e.text)).toEqual(["hello!"]);
    const all = await history.list({ userKey: "u1" });
    expect(all.map((e) => e.text)).toEqual([
      "hi",
      "how are you",
      "bye",
      "hello!",
    ]);

    // GDPR delete is a tombstone append with maxLength 1.
    expect(await history.delete({ userKey: "u1" })).toEqual({ deleted: 4 });
    expect(await history.count({ userKey: "u1" })).toBe(0);
    expect(await history.list({ userKey: "u1" })).toEqual([]);
    expect(await history.count({ userKey: "u2" })).toBe(1);

    await history.append(thread, { role: "user", text: "back" }, { userKey: "u1" });
    expect((await history.list({ userKey: "u1" })).map((e) => e.text)).toEqual([
      "back",
    ]);
  });

  test("history.user honors maxPerUser and retention", async () => {
    const state = await connectedAdapter();
    const history = userHistory(state, { maxPerUser: 2, retention: "1h" });
    for (const text of ["a", "b", "c"]) {
      await history.append(thread, { role: "user", text }, { userKey: "u1" });
    }
    expect((await history.list({ userKey: "u1" })).map((e) => e.text)).toEqual([
      "b",
      "c",
    ]);

    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    expect(await history.count({ userKey: "u1" })).toBe(0);

    // A new append after expiry starts a fresh transcript.
    await history.append(thread, { role: "user", text: "d" }, { userKey: "u1" });
    expect((await history.list({ userKey: "u1" })).map((e) => e.text)).toEqual([
      "d",
    ]);
  });
});
