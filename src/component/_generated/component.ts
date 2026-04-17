/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    kv: {
      del: FunctionReference<
        "mutation",
        "internal",
        { cacheKey: string; keyPrefix: string },
        null,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { cacheKey: string; keyPrefix: string },
        string | null,
        Name
      >;
      set: FunctionReference<
        "mutation",
        "internal",
        { cacheKey: string; keyPrefix: string; ttlMs?: number; value: string },
        null,
        Name
      >;
      setIfNotExists: FunctionReference<
        "mutation",
        "internal",
        { cacheKey: string; keyPrefix: string; ttlMs?: number; value: string },
        boolean,
        Name
      >;
    };
    lists: {
      appendToList: FunctionReference<
        "mutation",
        "internal",
        {
          keyPrefix: string;
          listKey: string;
          maxLength?: number;
          ttlMs?: number;
          value: string;
        },
        null,
        Name
      >;
      getList: FunctionReference<
        "query",
        "internal",
        { keyPrefix: string; listKey: string },
        Array<string>,
        Name
      >;
    };
    locks: {
      acquireLock: FunctionReference<
        "mutation",
        "internal",
        { keyPrefix: string; threadId: string; token: string; ttlMs: number },
        { expiresAt: number; threadId: string; token: string } | null,
        Name
      >;
      extendLock: FunctionReference<
        "mutation",
        "internal",
        { keyPrefix: string; threadId: string; token: string; ttlMs: number },
        boolean,
        Name
      >;
      forceReleaseLock: FunctionReference<
        "mutation",
        "internal",
        { keyPrefix: string; threadId: string },
        null,
        Name
      >;
      releaseLock: FunctionReference<
        "mutation",
        "internal",
        { keyPrefix: string; threadId: string; token: string },
        null,
        Name
      >;
    };
    queues: {
      dequeue: FunctionReference<
        "mutation",
        "internal",
        { keyPrefix: string; threadId: string },
        { expiresAt: number; value: string } | null,
        Name
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt: number;
          keyPrefix: string;
          maxSize: number;
          threadId: string;
          value: string;
        },
        number,
        Name
      >;
      queueDepth: FunctionReference<
        "query",
        "internal",
        { keyPrefix: string; threadId: string },
        number,
        Name
      >;
    };
    subscriptions: {
      isSubscribed: FunctionReference<
        "query",
        "internal",
        { keyPrefix: string; threadId: string },
        boolean,
        Name
      >;
      subscribe: FunctionReference<
        "mutation",
        "internal",
        { keyPrefix: string; threadId: string },
        null,
        Name
      >;
      unsubscribe: FunctionReference<
        "mutation",
        "internal",
        { keyPrefix: string; threadId: string },
        null,
        Name
      >;
    };
  };
