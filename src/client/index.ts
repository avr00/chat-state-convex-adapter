import type { Lock, Logger, QueueEntry, StateAdapter } from "chat";
import { ConsoleLogger } from "chat";
import type { FunctionReference } from "convex/server";

/**
 * Minimal subset of Convex client methods we need. Both `ConvexHttpClient`
 * and `ConvexClient` satisfy this, so either works.
 */
export interface ConvexClientLike {
  mutation<Args extends Record<string, unknown>, Ret>(
    functionReference: FunctionReference<"mutation", "public", Args, Ret>,
    args: Args
  ): Promise<Ret>;
  query<Args extends Record<string, unknown>, Ret>(
    functionReference: FunctionReference<"query", "public", Args, Ret>,
    args: Args
  ): Promise<Ret>;
}

type Ref<
  Kind extends "mutation" | "query",
  Args extends Record<string, unknown>,
  Ret,
> = FunctionReference<Kind, "public", Args, Ret>;

type KP = { keyPrefix: string };
type WithThread = KP & { threadId: string };
type WithKey = KP & { cacheKey: string };

/**
 * Shape of the wrapper mutations/queries the user exports from their
 * `convex/chatState.ts`. Pass `api.chatState` as `api` to the adapter.
 * See `convex-chatState.template.ts` in this package for the exact file.
 */
export interface ChatStateApi {
  subscribe: Ref<"mutation", WithThread, null>;
  unsubscribe: Ref<"mutation", WithThread, null>;
  isSubscribed: Ref<"query", WithThread, boolean>;

  acquireLock: Ref<
    "mutation",
    WithThread & { ttlMs: number; token: string },
    { threadId: string; token: string; expiresAt: number } | null
  >;
  releaseLock: Ref<"mutation", WithThread & { token: string }, null>;
  forceReleaseLock: Ref<"mutation", WithThread, null>;
  extendLock: Ref<
    "mutation",
    WithThread & { token: string; ttlMs: number },
    boolean
  >;

  kvGet: Ref<"query", WithKey, string | null>;
  kvSet: Ref<
    "mutation",
    WithKey & { value: string; ttlMs?: number },
    null
  >;
  kvSetIfNotExists: Ref<
    "mutation",
    WithKey & { value: string; ttlMs?: number },
    boolean
  >;
  kvDelete: Ref<"mutation", WithKey, null>;

  appendToList: Ref<
    "mutation",
    KP & {
      listKey: string;
      value: string;
      maxLength?: number;
      ttlMs?: number;
    },
    null
  >;
  getList: Ref<"query", KP & { listKey: string }, string[]>;

  enqueue: Ref<
    "mutation",
    WithThread & { value: string; expiresAt: number; maxSize: number },
    number
  >;
  dequeue: Ref<
    "mutation",
    WithThread,
    { value: string; expiresAt: number } | null
  >;
  queueDepth: Ref<"query", WithThread, number>;
}

export interface ConvexStateAdapterOptions {
  /** Convex client (ConvexHttpClient or ConvexClient). */
  client: ConvexClientLike;
  /** Reference to your exported wrapper functions, typically `api.chatState`. */
  api: ChatStateApi;
  /** Namespace for all rows. Default: `"chat-sdk"`. */
  keyPrefix?: string;
  /** Logger instance for error reporting. */
  logger?: Logger;
}

function generateToken(): string {
  return `cvx_${crypto.randomUUID()}`;
}

export class ConvexStateAdapter implements StateAdapter {
  private readonly client: ConvexClientLike;
  private readonly api: ChatStateApi;
  private readonly keyPrefix: string;
  private readonly logger: Logger;
  private connected = false;

  constructor(options: ConvexStateAdapterOptions) {
    this.client = options.client;
    this.api = options.api;
    this.keyPrefix = options.keyPrefix ?? "chat-sdk";
    this.logger = options.logger ?? new ConsoleLogger("info").child("convex");
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async subscribe(threadId: string): Promise<void> {
    this.ensureConnected();
    await this.client.mutation(this.api.subscribe, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
  }

  async unsubscribe(threadId: string): Promise<void> {
    this.ensureConnected();
    await this.client.mutation(this.api.unsubscribe, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
  }

  async isSubscribed(threadId: string): Promise<boolean> {
    this.ensureConnected();
    return this.client.query(this.api.isSubscribed, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
  }

  async acquireLock(threadId: string, ttlMs: number): Promise<Lock | null> {
    this.ensureConnected();
    const token = generateToken();
    const result = await this.client.mutation(this.api.acquireLock, {
      keyPrefix: this.keyPrefix,
      threadId,
      ttlMs,
      token,
    });
    return result;
  }

  async releaseLock(lock: Lock): Promise<void> {
    this.ensureConnected();
    await this.client.mutation(this.api.releaseLock, {
      keyPrefix: this.keyPrefix,
      threadId: lock.threadId,
      token: lock.token,
    });
  }

  async forceReleaseLock(threadId: string): Promise<void> {
    this.ensureConnected();
    await this.client.mutation(this.api.forceReleaseLock, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
  }

  async extendLock(lock: Lock, ttlMs: number): Promise<boolean> {
    this.ensureConnected();
    return this.client.mutation(this.api.extendLock, {
      keyPrefix: this.keyPrefix,
      threadId: lock.threadId,
      token: lock.token,
      ttlMs,
    });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    this.ensureConnected();
    const raw = await this.client.query(this.api.kvGet, {
      keyPrefix: this.keyPrefix,
      cacheKey: key,
    });
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn("kv value was not valid JSON; returning raw string", {
        key,
      });
      return raw as unknown as T;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.ensureConnected();
    await this.client.mutation(this.api.kvSet, {
      keyPrefix: this.keyPrefix,
      cacheKey: key,
      value: JSON.stringify(value),
      ttlMs,
    });
  }

  async setIfNotExists(
    key: string,
    value: unknown,
    ttlMs?: number
  ): Promise<boolean> {
    this.ensureConnected();
    return this.client.mutation(this.api.kvSetIfNotExists, {
      keyPrefix: this.keyPrefix,
      cacheKey: key,
      value: JSON.stringify(value),
      ttlMs,
    });
  }

  async delete(key: string): Promise<void> {
    this.ensureConnected();
    await this.client.mutation(this.api.kvDelete, {
      keyPrefix: this.keyPrefix,
      cacheKey: key,
    });
  }

  async appendToList(
    key: string,
    value: unknown,
    options?: { maxLength?: number; ttlMs?: number }
  ): Promise<void> {
    this.ensureConnected();
    await this.client.mutation(this.api.appendToList, {
      keyPrefix: this.keyPrefix,
      listKey: key,
      value: JSON.stringify(value),
      maxLength: options?.maxLength,
      ttlMs: options?.ttlMs,
    });
  }

  async getList<T = unknown>(key: string): Promise<T[]> {
    this.ensureConnected();
    const rows = await this.client.query(this.api.getList, {
      keyPrefix: this.keyPrefix,
      listKey: key,
    });
    return rows.map((r) => JSON.parse(r) as T);
  }

  async enqueue(
    threadId: string,
    entry: QueueEntry,
    maxSize: number
  ): Promise<number> {
    this.ensureConnected();
    return this.client.mutation(this.api.enqueue, {
      keyPrefix: this.keyPrefix,
      threadId,
      value: JSON.stringify(entry),
      expiresAt: entry.expiresAt,
      maxSize,
    });
  }

  async dequeue(threadId: string): Promise<QueueEntry | null> {
    this.ensureConnected();
    const row = await this.client.mutation(this.api.dequeue, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
    if (!row) return null;
    return JSON.parse(row.value) as QueueEntry;
  }

  async queueDepth(threadId: string): Promise<number> {
    this.ensureConnected();
    return this.client.query(this.api.queueDepth, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error(
        "ConvexStateAdapter is not connected. Call connect() first."
      );
    }
  }
}

export function createConvexState(
  options: ConvexStateAdapterOptions
): ConvexStateAdapter {
  return new ConvexStateAdapter(options);
}
