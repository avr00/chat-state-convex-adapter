# chat-state-convex-adapter

Convex state adapter for [chat-sdk](https://chat-sdk.dev), shipped as a [Convex Component](https://convex.dev/components).

Stores subscriptions, distributed locks, dedupe (via `setIfNotExists`), lists, and queues in your Convex deployment — so Chat SDK's webhook handlers can run on any serverless platform and share state safely.

## Why Convex?

- **Serializable mutations** replace the lock-acquisition gymnastics of `SET NX PX` / `INSERT ON CONFLICT`. Lock correctness comes for free.
- **Component isolation**: chat state lives in its own tables, separate from your app's schema.
- **Built-in cleanup cron** — expired rows are swept hourly without operator intervention.

## Install

```bash
npm install chat-state-convex-adapter
# or
pnpm add chat-state-convex-adapter
# or
yarn add chat-state-convex-adapter
# or
bun add chat-state-convex-adapter
```

## Set up the component

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import chatState from "chat-state-convex-adapter/convex.config.js";

const app = defineApp();
app.use(chatState);

export default app;
```

## Pick your usage pattern

**A. Inside a Convex `httpAction` / `action` (recommended if your stack is Convex-native).** No wrapper file needed — the adapter uses `ctx.runMutation` directly. Skip to [Option A](#option-a-inside-a-convex-action).

**B. From an external runtime (Next.js route, Cloudflare Worker, etc.) via `ConvexHttpClient`.** Requires a one-file wrapper in your `convex/` dir. See [Option B](#option-b-from-an-external-runtime).

### Option A — inside a Convex action

```ts
// convex/webhook.ts
import { httpAction } from "./_generated/server";
import { components } from "./_generated/api";
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createConvexStateFromCtx } from "chat-state-convex-adapter";

export const slackWebhook = httpAction(async (ctx, request) => {
  const state = createConvexStateFromCtx({
    ctx,
    component: components.chatState,
  });
  await state.connect();

  const bot = new Chat({
    userName: "mybot",
    adapters: { slack: createSlackAdapter() },
    state,
  });

  return bot.webhooks.slack(request);
});
```

No wrapper file, no HTTP client. `ctx.runMutation` talks to the component natively.

### Option B — from an external runtime

Add the wrapper functions to your own `convex/` dir (Convex components don't expose public functions to external clients, so the app must forward them). One helper call instead of 150 lines:

```ts
// convex/chatState.ts
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { createChatStateWrappers } from "chat-state-convex-adapter/wrappers";

export const {
  subscribe, unsubscribe, isSubscribed,
  acquireLock, releaseLock, forceReleaseLock, extendLock,
  kvGet, kvSet, kvSetIfNotExists, kvDelete,
  appendToList, getList,
  enqueue, dequeue, queueDepth,
} = createChatStateWrappers({
  mutation,
  query,
  component: components.chatState,
});
```

Then wire the adapter with a `ConvexHttpClient`:

```ts
// your webhook route (Next.js, etc.)
import { ConvexHttpClient } from "convex/browser";
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createConvexState } from "chat-state-convex-adapter";
import { api } from "./convex/_generated/api";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const state = createConvexState({ client, api: api.chatState });
await state.connect();

const bot = new Chat({
  userName: "mybot",
  adapters: { slack: createSlackAdapter() },
  state,
});
```

## Options

### `createConvexState` (external HTTP client)

| Option | Required | Default | Description |
|---|---|---|---|
| `client` | yes | — | `ConvexHttpClient` or `ConvexClient` pointed at your deployment |
| `api` | yes | — | Your wrapper API, typically `api.chatState` |
| `keyPrefix` | no | `"chat-sdk"` | See [Multi-tenant usage](#multi-tenant-usage) |
| `logger` | no | `ConsoleLogger("info").child("convex")` | Any Chat SDK `Logger` |

### `createConvexStateFromCtx` (inside Convex)

| Option | Required | Default | Description |
|---|---|---|---|
| `ctx` | yes | — | Action/mutation ctx (must support `runMutation`/`runQuery`) |
| `component` | yes | — | Component reference, typically `components.chatState` |
| `keyPrefix` | no | `"chat-sdk"` | See [Multi-tenant usage](#multi-tenant-usage) |
| `logger` | no | `ConsoleLogger("info").child("convex-ctx")` | Any Chat SDK `Logger` |

## Multi-tenant usage

`keyPrefix` is a **load-bearing isolation primitive**, not a cosmetic namespace. Every row written by the adapter is scoped to it, so choosing the right value is how you run more than one bot on a single Convex deployment without them stepping on each other's subscriptions, locks, and queues.

A useful convention: `${tenantId}:${workspaceId}:${platform}`.

```ts
const state = createConvexStateFromCtx({
  ctx,
  component: components.chatState,
  keyPrefix: `${tenantId}:${workspaceId}:slack`,
});
```

Why not just `workspaceId`? A single workspace can host multiple bots (one for Slack, one for Discord, one dev, one prod) and they must not share lock or dedupe keys. Include every dimension that can produce an independent bot instance.

Because `keyPrefix` gates every read and write, **misconfiguring it is silently destructive** — two deployments with the same prefix will see each other's state. Treat it like a schema name, not a log tag.

## What it stores

| Table | Purpose |
|---|---|
| `subscriptions` | Threads the bot is actively listening to |
| `locks` | Token-gated per-thread mutual exclusion (`acquire`, `release`, `forceRelease`, `extend`) |
| `kv` | TTL'd key-value for the Chat SDK's internal caches and dedupe (`setIfNotExists`) |
| `lists` | Ordered append-only with `maxLength` trim and TTL refresh |
| `queues` | Per-thread FIFO with `maxSize` bound and per-entry TTL |

An internal cron sweeps expired rows hourly.

## Limitations

- **Server-side only.** The adapter uses `ConvexHttpClient`, so it must run in Node or Edge, not in a browser bot.
- **One-time wrapper copy.** Convex components don't expose public functions to external clients directly; the template wrapper file is the standard workaround.

## Auth

Chat SDK state is bot infrastructure — the `ConvexHttpClient` making the calls *is* the bot. Per-user auth usually doesn't apply. For multi-bot or multi-workspace isolation, pass a distinct `keyPrefix` per bot.

If you do need to gate access, the wrapper mutations in your `convex/chatState.ts` run in your app and have full `ctx.auth` access — enforce there before forwarding to the component:

```ts
export const subscribe = mutation({
  args: { keyPrefix: v.string(), threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("unauthorized");
    return ctx.runMutation(components.chatState.subscriptions.subscribe, args);
  },
});
```

## Development

```bash
pnpm install
pnpm build:codegen   # regenerates _generated/ and builds dist/
pnpm test            # runs vitest against the component + adapter
pnpm typecheck
```

The `example/` directory is the host app convex commands run against, following the [rate-limiter](https://github.com/get-convex/rate-limiter) convention.

## Alternatives

If you're not on Convex, use one of the official state adapters from [chat-sdk](https://chat-sdk.dev/adapters):

- `@chat-adapter/state-redis` / `state-ioredis` — Redis or Upstash
- `@chat-adapter/state-pg` — PostgreSQL
- `@chat-adapter/state-memory` — dev/test only

## License

MIT
