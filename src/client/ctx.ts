import type { Lock, Logger, QueueEntry, StateAdapter } from "chat";
import { ConsoleLogger } from "chat";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

/**
 * The subset of a Convex action/mutation `ctx` we need. Any `ActionCtx` or
 * `MutationCtx` from the installing app satisfies this shape.
 *
 * The component's functions are `"internal"` from the app's perspective, so
 * we constrain to that visibility.
 */
export type RunComponentCtx = {
  runMutation: <Mutation extends FunctionReference<"mutation", "internal">>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>
  ) => Promise<FunctionReturnType<Mutation>>;
  runQuery: <Query extends FunctionReference<"query", "internal">>(
    query: Query,
    args: FunctionArgs<Query>
  ) => Promise<FunctionReturnType<Query>>;
};

export interface ConvexCtxStateAdapterOptions {
  /** A Convex action or mutation `ctx` with `runMutation`/`runQuery`. */
  ctx: RunComponentCtx;
  /** The mounted component reference, typically `components.chatState`. */
  component: ComponentApi;
  /** Namespace for all rows. Default: `"chat-sdk"`. */
  keyPrefix?: string;
  /** Logger instance for error reporting. */
  logger?: Logger;
}

function generateToken(): string {
  return `cvx_${crypto.randomUUID()}`;
}

/**
 * Chat SDK state adapter that runs inside a Convex action or httpAction.
 *
 * Unlike `ConvexStateAdapter` (which uses a `ConvexHttpClient` from an
 * external process), this variant calls the component directly via
 * `ctx.runMutation` / `ctx.runQuery`. No wrapper file is needed — the
 * calls go straight to `components.chatState.*`.
 *
 * Use this when your Chat SDK webhook handler lives inside a Convex
 * `httpAction`. Use `ConvexStateAdapter` when the handler lives in an
 * external runtime (Next.js route, Cloudflare Worker, etc.).
 */
export class ConvexCtxStateAdapter implements StateAdapter {
  private readonly ctx: RunComponentCtx;
  private readonly component: ComponentApi;
  private readonly keyPrefix: string;
  private readonly logger: Logger;
  private connected = false;

  constructor(options: ConvexCtxStateAdapterOptions) {
    this.ctx = options.ctx;
    this.component = options.component;
    this.keyPrefix = options.keyPrefix ?? "chat-sdk";
    this.logger =
      options.logger ?? new ConsoleLogger("info").child("convex-ctx");
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async subscribe(threadId: string): Promise<void> {
    this.ensureConnected();
    await this.ctx.runMutation(this.component.subscriptions.subscribe, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
  }

  async unsubscribe(threadId: string): Promise<void> {
    this.ensureConnected();
    await this.ctx.runMutation(this.component.subscriptions.unsubscribe, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
  }

  async isSubscribed(threadId: string): Promise<boolean> {
    this.ensureConnected();
    return this.ctx.runQuery(this.component.subscriptions.isSubscribed, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
  }

  async acquireLock(threadId: string, ttlMs: number): Promise<Lock | null> {
    this.ensureConnected();
    const token = generateToken();
    return this.ctx.runMutation(this.component.locks.acquireLock, {
      keyPrefix: this.keyPrefix,
      threadId,
      ttlMs,
      token,
    });
  }

  async releaseLock(lock: Lock): Promise<void> {
    this.ensureConnected();
    await this.ctx.runMutation(this.component.locks.releaseLock, {
      keyPrefix: this.keyPrefix,
      threadId: lock.threadId,
      token: lock.token,
    });
  }

  async forceReleaseLock(threadId: string): Promise<void> {
    this.ensureConnected();
    await this.ctx.runMutation(this.component.locks.forceReleaseLock, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
  }

  async extendLock(lock: Lock, ttlMs: number): Promise<boolean> {
    this.ensureConnected();
    return this.ctx.runMutation(this.component.locks.extendLock, {
      keyPrefix: this.keyPrefix,
      threadId: lock.threadId,
      token: lock.token,
      ttlMs,
    });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    this.ensureConnected();
    const raw = await this.ctx.runQuery(this.component.kv.get, {
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
    await this.ctx.runMutation(this.component.kv.set, {
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
    return this.ctx.runMutation(this.component.kv.setIfNotExists, {
      keyPrefix: this.keyPrefix,
      cacheKey: key,
      value: JSON.stringify(value),
      ttlMs,
    });
  }

  async delete(key: string): Promise<void> {
    this.ensureConnected();
    await this.ctx.runMutation(this.component.kv.del, {
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
    await this.ctx.runMutation(this.component.lists.appendToList, {
      keyPrefix: this.keyPrefix,
      listKey: key,
      value: JSON.stringify(value),
      maxLength: options?.maxLength,
      ttlMs: options?.ttlMs,
    });
  }

  async getList<T = unknown>(key: string): Promise<T[]> {
    this.ensureConnected();
    const rows = await this.ctx.runQuery(this.component.lists.getList, {
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
    return this.ctx.runMutation(this.component.queues.enqueue, {
      keyPrefix: this.keyPrefix,
      threadId,
      value: JSON.stringify(entry),
      expiresAt: entry.expiresAt,
      maxSize,
    });
  }

  async dequeue(threadId: string): Promise<QueueEntry | null> {
    this.ensureConnected();
    const row = await this.ctx.runMutation(this.component.queues.dequeue, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
    if (!row) return null;
    return JSON.parse(row.value) as QueueEntry;
  }

  async queueDepth(threadId: string): Promise<number> {
    this.ensureConnected();
    return this.ctx.runQuery(this.component.queues.queueDepth, {
      keyPrefix: this.keyPrefix,
      threadId,
    });
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error(
        "ConvexCtxStateAdapter is not connected. Call connect() first."
      );
    }
  }
}

export function createConvexStateFromCtx(
  options: ConvexCtxStateAdapterOptions
): ConvexCtxStateAdapter {
  return new ConvexCtxStateAdapter(options);
}
