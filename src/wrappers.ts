import type {
  GenericDataModel,
  MutationBuilder,
  QueryBuilder,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "./component/_generated/component.js";

/**
 * Replaces the 150-line `src/templates/convex-chatState.ts.template` with a
 * single helper call. Users drop this into their own `convex/chatState.ts`:
 *
 * ```ts
 * import { mutation, query } from "./_generated/server";
 * import { components } from "./_generated/api";
 * import { createChatStateWrappers } from "chat-state-convex-adapter/wrappers";
 *
 * export const {
 *   subscribe, unsubscribe, isSubscribed,
 *   acquireLock, releaseLock, forceReleaseLock, extendLock,
 *   kvGet, kvSet, kvSetIfNotExists, kvDelete,
 *   appendToList, getList,
 *   enqueue, dequeue, queueDepth,
 * } = createChatStateWrappers({
 *   mutation,
 *   query,
 *   component: components.chatState,
 * });
 * ```
 *
 * Convex's codegen picks up top-level named exports — destructuring the
 * returned object gives it exactly the shape it expects. Then pass
 * `api.chatState` as the `api` option to `createConvexState({ client, api })`.
 */
export function createChatStateWrappers<DM extends GenericDataModel>(deps: {
  mutation: MutationBuilder<DM, "public">;
  query: QueryBuilder<DM, "public">;
  component: ComponentApi;
}): ChatStateWrappers {
  const { mutation, query, component } = deps;

  return {
    subscribe: mutation({
      args: { keyPrefix: v.string(), threadId: v.string() },
      returns: v.null(),
      handler: (ctx, args) =>
        ctx.runMutation(component.subscriptions.subscribe, args),
    }),

    unsubscribe: mutation({
      args: { keyPrefix: v.string(), threadId: v.string() },
      returns: v.null(),
      handler: (ctx, args) =>
        ctx.runMutation(component.subscriptions.unsubscribe, args),
    }),

    isSubscribed: query({
      args: { keyPrefix: v.string(), threadId: v.string() },
      returns: v.boolean(),
      handler: (ctx, args) =>
        ctx.runQuery(component.subscriptions.isSubscribed, args),
    }),

    acquireLock: mutation({
      args: {
        keyPrefix: v.string(),
        threadId: v.string(),
        ttlMs: v.number(),
        token: v.string(),
      },
      returns: v.union(
        v.object({
          threadId: v.string(),
          token: v.string(),
          expiresAt: v.number(),
        }),
        v.null()
      ),
      handler: (ctx, args) =>
        ctx.runMutation(component.locks.acquireLock, args),
    }),

    releaseLock: mutation({
      args: { keyPrefix: v.string(), threadId: v.string(), token: v.string() },
      returns: v.null(),
      handler: (ctx, args) =>
        ctx.runMutation(component.locks.releaseLock, args),
    }),

    forceReleaseLock: mutation({
      args: { keyPrefix: v.string(), threadId: v.string() },
      returns: v.null(),
      handler: (ctx, args) =>
        ctx.runMutation(component.locks.forceReleaseLock, args),
    }),

    extendLock: mutation({
      args: {
        keyPrefix: v.string(),
        threadId: v.string(),
        token: v.string(),
        ttlMs: v.number(),
      },
      returns: v.boolean(),
      handler: (ctx, args) =>
        ctx.runMutation(component.locks.extendLock, args),
    }),

    kvGet: query({
      args: { keyPrefix: v.string(), cacheKey: v.string() },
      returns: v.union(v.string(), v.null()),
      handler: (ctx, args) => ctx.runQuery(component.kv.get, args),
    }),

    kvSet: mutation({
      args: {
        keyPrefix: v.string(),
        cacheKey: v.string(),
        value: v.string(),
        ttlMs: v.optional(v.number()),
      },
      returns: v.null(),
      handler: (ctx, args) => ctx.runMutation(component.kv.set, args),
    }),

    kvSetIfNotExists: mutation({
      args: {
        keyPrefix: v.string(),
        cacheKey: v.string(),
        value: v.string(),
        ttlMs: v.optional(v.number()),
      },
      returns: v.boolean(),
      handler: (ctx, args) =>
        ctx.runMutation(component.kv.setIfNotExists, args),
    }),

    kvDelete: mutation({
      args: { keyPrefix: v.string(), cacheKey: v.string() },
      returns: v.null(),
      handler: (ctx, args) => ctx.runMutation(component.kv.del, args),
    }),

    appendToList: mutation({
      args: {
        keyPrefix: v.string(),
        listKey: v.string(),
        value: v.string(),
        maxLength: v.optional(v.number()),
        ttlMs: v.optional(v.number()),
      },
      returns: v.null(),
      handler: (ctx, args) =>
        ctx.runMutation(component.lists.appendToList, args),
    }),

    getList: query({
      args: { keyPrefix: v.string(), listKey: v.string() },
      returns: v.array(v.string()),
      handler: (ctx, args) => ctx.runQuery(component.lists.getList, args),
    }),

    enqueue: mutation({
      args: {
        keyPrefix: v.string(),
        threadId: v.string(),
        value: v.string(),
        expiresAt: v.number(),
        maxSize: v.number(),
      },
      returns: v.number(),
      handler: (ctx, args) => ctx.runMutation(component.queues.enqueue, args),
    }),

    dequeue: mutation({
      args: { keyPrefix: v.string(), threadId: v.string() },
      returns: v.union(
        v.object({ value: v.string(), expiresAt: v.number() }),
        v.null()
      ),
      handler: (ctx, args) => ctx.runMutation(component.queues.dequeue, args),
    }),

    queueDepth: query({
      args: { keyPrefix: v.string(), threadId: v.string() },
      returns: v.number(),
      handler: (ctx, args) => ctx.runQuery(component.queues.queueDepth, args),
    }),
  };
}

export interface ChatStateWrappers {
  subscribe: RegisteredMutation<
    "public",
    { keyPrefix: string; threadId: string },
    Promise<null>
  >;
  unsubscribe: RegisteredMutation<
    "public",
    { keyPrefix: string; threadId: string },
    Promise<null>
  >;
  isSubscribed: RegisteredQuery<
    "public",
    { keyPrefix: string; threadId: string },
    Promise<boolean>
  >;
  acquireLock: RegisteredMutation<
    "public",
    {
      keyPrefix: string;
      threadId: string;
      ttlMs: number;
      token: string;
    },
    Promise<{ threadId: string; token: string; expiresAt: number } | null>
  >;
  releaseLock: RegisteredMutation<
    "public",
    { keyPrefix: string; threadId: string; token: string },
    Promise<null>
  >;
  forceReleaseLock: RegisteredMutation<
    "public",
    { keyPrefix: string; threadId: string },
    Promise<null>
  >;
  extendLock: RegisteredMutation<
    "public",
    {
      keyPrefix: string;
      threadId: string;
      token: string;
      ttlMs: number;
    },
    Promise<boolean>
  >;
  kvGet: RegisteredQuery<
    "public",
    { keyPrefix: string; cacheKey: string },
    Promise<string | null>
  >;
  kvSet: RegisteredMutation<
    "public",
    {
      keyPrefix: string;
      cacheKey: string;
      value: string;
      ttlMs?: number;
    },
    Promise<null>
  >;
  kvSetIfNotExists: RegisteredMutation<
    "public",
    {
      keyPrefix: string;
      cacheKey: string;
      value: string;
      ttlMs?: number;
    },
    Promise<boolean>
  >;
  kvDelete: RegisteredMutation<
    "public",
    { keyPrefix: string; cacheKey: string },
    Promise<null>
  >;
  appendToList: RegisteredMutation<
    "public",
    {
      keyPrefix: string;
      listKey: string;
      value: string;
      maxLength?: number;
      ttlMs?: number;
    },
    Promise<null>
  >;
  getList: RegisteredQuery<
    "public",
    { keyPrefix: string; listKey: string },
    Promise<string[]>
  >;
  enqueue: RegisteredMutation<
    "public",
    {
      keyPrefix: string;
      threadId: string;
      value: string;
      expiresAt: number;
      maxSize: number;
    },
    Promise<number>
  >;
  dequeue: RegisteredMutation<
    "public",
    { keyPrefix: string; threadId: string },
    Promise<{ value: string; expiresAt: number } | null>
  >;
  queueDepth: RegisteredQuery<
    "public",
    { keyPrefix: string; threadId: string },
    Promise<number>
  >;
}
