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

## Add the wrapper functions

Chat SDK calls the state adapter from outside Convex (e.g. a Next.js webhook route). Convex component public functions aren't reachable from external HTTP clients, so you export thin wrappers from your own `convex/` directory.

Copy [`convex-chatState.ts.template`](./src/templates/convex-chatState.ts.template) into `convex/chatState.ts` in your app. It's 17 trivial forwarders to `components.chatState.*`.

## Wire the adapter

```ts
import { ConvexHttpClient } from "convex/browser";
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createConvexState } from "chat-state-convex-adapter";
import { api } from "./convex/_generated/api";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const bot = new Chat({
  userName: "mybot",
  adapters: { slack: createSlackAdapter() },
  state: createConvexState({ client, api: api.chatState }),
});

await bot.state.connect();
```

## Options

| Option | Required | Default | Description |
|---|---|---|---|
| `client` | yes | — | A `ConvexHttpClient` or `ConvexClient` pointed at your deployment |
| `api` | yes | — | Your wrapper API from `api.chatState` (see above) |
| `keyPrefix` | no | `"chat-sdk"` | Namespace for all rows, in case you run multiple bots on one deployment |
| `logger` | no | `ConsoleLogger("info").child("convex")` | Any Chat SDK `Logger` |

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
