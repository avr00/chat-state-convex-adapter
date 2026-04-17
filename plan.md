# chat-state-convex — Implementation Plan

A Chat SDK state adapter backed by Convex, shipped as a Convex Component. One package, two audiences: listed on the Chat SDK community adapters page and on convex.dev/components.

Target effort: ~1 week solo.

---

## 1. Goal and scope

Build a persistent state backend for the Chat SDK (`chat` npm package) that implements the `StateAdapter` interface. Confirmed by reading the actual source at `github.com/vercel/chat/packages/state-pg/src/index.ts` and `state-memory/src/index.ts`, the interface requires:

- **Subscriptions** — which threads the bot is actively listening to (set of thread IDs)
- **Locks** — per-thread mutual exclusion, token-gated so `releaseLock` can't free someone else's lock; also `forceReleaseLock` and `extendLock`
- **KV cache** — `get`/`set`/`setIfNotExists`/`delete` with optional TTL. **Dedupe is not a separate concept** — Chat SDK implements it via `setIfNotExists` on the KV.
- **Lists** — append-only ordered lists with optional `maxLength` trim (keep newest) and TTL; read via `getList`
- **Queues** — FIFO per thread with `enqueue`/`dequeue`/`queueDepth`, bounded by `maxSize`, per-entry `expiresAt`
- **Connect/disconnect lifecycle** — `connect()` is called before any operation; `disconnect()` on shutdown

Full method list (17): `connect`, `disconnect`, `subscribe`, `unsubscribe`, `isSubscribed`, `acquireLock`, `releaseLock`, `forceReleaseLock`, `extendLock`, `get`, `set`, `setIfNotExists`, `delete`, `appendToList`, `getList`, `enqueue`, `dequeue`, `queueDepth`.

All of this runs inside a Convex deployment as a **Convex Component**, so consumers install one npm package, register it in `convex.config.ts`, and pass `createConvexState({ client })` to `new Chat({ state })`.

**Out of scope (v1):**
- Platform-side (Slack/Discord-style) adapter. Convex is a backend, not a chat surface.
- Message history persistence. Chat SDK state adapters do not own message storage.
- Multi-tenant / per-bot namespacing beyond `keyPrefix` parity with the Postgres/Redis adapters.

---

## 2. Package identity

| Field | Value |
|---|---|
| npm name | `chat-state-convex` (unscoped; `@chat-adapter/*` is reserved per https://chat-sdk.dev/docs/contributing/publishing — confirmed by checking `state-pg/package.json` which uses `@chat-adapter/state-pg` as a Vercel-maintained package) |
| Class | `ConvexStateAdapter implements StateAdapter` (mirrors `PostgresStateAdapter` / `MemoryStateAdapter`) |
| Factory | `createConvexState(options)` returning the class |
| Convex component name | `chatState` (registered via `defineComponent`) |
| Convex component path | `chat-state-convex/convex.config.js` |
| License | Apache-2.0 (matches `@convex-dev/rate-limiter`) |
| Peer deps | `chat ^<current>`, `convex ^<current>` |
| Keywords | `chat-sdk`, `chat-adapter`, `chat-state`, `convex`, `convex-component` |
| Build tool | `tsup` (matches state-pg/state-redis) |

---

## 3. Architecture

```
┌─────────────────────────────┐
│  user's app (Next.js etc.)  │
│                             │
│  const bot = new Chat({     │
│    state: createConvexState │
│      ({ client }),          │
│    adapters: { slack: … }   │
│  })                         │
└──────────────┬──────────────┘
               │  ctx.runMutation / runQuery
               ▼
┌─────────────────────────────┐
│  Convex deployment          │
│  app.use(chatState) in      │
│  convex.config.ts           │
│                             │
│  tables (isolated):         │
│   - subscriptions           │
│   - locks                   │
│   - dedupe                  │
│   - kv                      │
│                             │
│  cron: cleanupExpired()     │
└─────────────────────────────┘
```

The factory returns an object that satisfies Chat SDK's `StateAdapter` interface. Internally every method calls the corresponding component mutation/query via `ConvexHttpClient` (or accepts a pre-built client the app already has).

**Why Convex is a good fit:**
- Mutations are serializable transactions — atomic lock acquire is one mutation, no Lua, no `SET NX PX` gymnastics.
- Indexed queries by `expiresAt` make lazy-expiry free.
- Built-in cron in the component handles hard cleanup.

**Why it's tricky:**
- Component public functions are not client-callable over WebSocket; they're only reachable via `ctx.runMutation` from the installing app. For a *state* adapter this is fine — state is always called server-side. But it means the adapter must be used in Node/Edge, not from a browser bot.
- Components cannot read `process.env` or `ctx.auth`. Anything that needs a secret must be passed as an arg.
- All public component functions need explicit arg + return validators.

---

## 4. Reference points

| Topic | Source |
|---|---|
| Authoritative `StateAdapter` interface | `github.com/vercel/chat/packages/chat/src` (imports: `Lock`, `QueueEntry`, `StateAdapter`, `Logger`, `ConsoleLogger`) |
| Closest reference impl to copy | `github.com/vercel/chat/packages/state-pg/src/index.ts` — every method mapped 1:1 to a table + SQL pattern we can translate to Convex |
| Simpler reference impl | `github.com/vercel/chat/packages/state-memory/src/index.ts` — clean per-method semantics, useful for test parity |
| Shared test patterns to mirror | `github.com/vercel/chat/packages/state-memory/src/index.test.ts` — we should port these cases verbatim |
| Option names, keyPrefix, env auto-detect | https://chat-sdk.dev/adapters/postgres, https://chat-sdk.dev/adapters/redis |
| Component repo layout + build pipeline | https://github.com/get-convex/rate-limiter |
| Authoring rules (validators, no `ctx.auth`, no `process.env`) | https://docs.convex.dev/components/authoring |
| Testing conventions (vitest + coverage-v8) | https://chat-sdk.dev/docs/contributing/testing |
| Publishing conventions (ESM only, files: ["dist"], exports map) | https://chat-sdk.dev/docs/contributing/publishing |

---

## 5. Repo layout

```
chat-state-convex/
├── convex/                     # the component itself
│   ├── convex.config.ts        # defineComponent("chatState")
│   ├── schema.ts               # 5 tables + indexes
│   ├── subscriptions.ts        # subscribe, unsubscribe, isSubscribed
│   ├── locks.ts                # acquireLock, releaseLock (token-gated), forceReleaseLock, extendLock
│   ├── kv.ts                   # get, set, setIfNotExists, delete  (dedupe is setIfNotExists)
│   ├── lists.ts                # appendToList (with maxLength + ttl), getList
│   ├── queues.ts               # enqueue, dequeue, queueDepth
│   ├── crons.ts                # hourly cleanup of expired rows (locks, kv, lists, queues)
│   └── _generated/             # gitignored, produced by convex codegen
├── src/
│   ├── index.ts                # createConvexState() factory, exports types
│   ├── client.ts               # wraps a ConvexHttpClient or ConvexClient
│   └── types.ts                # re-exports of Chat SDK state interface for clarity
├── example/                    # optional but highly recommended (rate-limiter does this)
│   ├── convex/
│   │   ├── convex.config.ts    # imports the component
│   │   └── example.ts
│   └── src/
├── test/
│   ├── subscriptions.test.ts
│   ├── locks.test.ts
│   ├── dedupe.test.ts
│   ├── kv.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.mts
├── eslint.config.js
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

`package.json` `exports` map must include:

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./convex.config.js": "./convex/convex.config.js",
    "./convex.config": "./convex/convex.config.js"
  },
  "files": ["dist", "convex"],
  "type": "module"
}
```

---

## 6. Schema

Schema is a direct translation of `state-pg`'s six tables (minus the `updated_at` audit columns Convex already provides via `_creationTime` + manual writes).

```ts
// convex/schema.ts
defineSchema({
  subscriptions: defineTable({
    keyPrefix: v.string(),
    threadId: v.string(),
  }).index("by_prefix_thread", ["keyPrefix", "threadId"]),

  locks: defineTable({
    keyPrefix: v.string(),
    threadId: v.string(),
    token: v.string(),          // token-gated release
    expiresAt: v.number(),
  }).index("by_prefix_thread", ["keyPrefix", "threadId"])
    .index("by_expires", ["expiresAt"]),

  kv: defineTable({
    keyPrefix: v.string(),
    cacheKey: v.string(),
    value: v.string(),          // JSON-encoded
    expiresAt: v.optional(v.number()),
  }).index("by_prefix_key", ["keyPrefix", "cacheKey"])
    .index("by_expires", ["expiresAt"]),

  lists: defineTable({
    keyPrefix: v.string(),
    listKey: v.string(),
    seq: v.number(),            // monotonic per (prefix, listKey)
    value: v.string(),
    expiresAt: v.optional(v.number()),
  }).index("by_prefix_key_seq", ["keyPrefix", "listKey", "seq"])
    .index("by_expires", ["expiresAt"]),

  queues: defineTable({
    keyPrefix: v.string(),
    threadId: v.string(),
    seq: v.number(),
    value: v.string(),          // JSON-encoded QueueEntry
    expiresAt: v.number(),      // always set; per-entry TTL
  }).index("by_prefix_thread_seq", ["keyPrefix", "threadId", "seq"])
    .index("by_expires", ["expiresAt"]),
});
```

`seq` is assigned by reading `max(seq)` inside the same mutation and adding 1 — safe because mutations are serializable. Alternative: use `_creationTime` as the sort key (it's a float timestamp, monotonic within a single mutation).

Lock acquisition mutation, mirroring `state-pg`'s `INSERT ... ON CONFLICT ... WHERE expires_at <= now()`:

```ts
// convex/locks.ts
export const acquire = mutation({
  args: { keyPrefix: v.string(), threadId: v.string(), ttlMs: v.number(), token: v.string() },
  returns: v.union(
    v.object({ threadId: v.string(), token: v.string(), expiresAt: v.number() }),
    v.null(),
  ),
  handler: async (ctx, { keyPrefix, threadId, ttlMs, token }) => {
    const now = Date.now();
    const existing = await ctx.db.query("locks")
      .withIndex("by_prefix_thread", q => q.eq("keyPrefix", keyPrefix).eq("threadId", threadId))
      .unique();
    if (existing && existing.expiresAt > now) return null;
    const expiresAt = now + ttlMs;
    if (existing) {
      await ctx.db.patch(existing._id, { token, expiresAt });
    } else {
      await ctx.db.insert("locks", { keyPrefix, threadId, token, expiresAt });
    }
    return { threadId, token, expiresAt };
  },
});
```

`releaseLock` must match on `token` (mirroring pg's `WHERE token = $3`); `forceReleaseLock` deletes unconditionally. `extendLock` updates `expiresAt` only when `token` matches AND the existing row isn't already expired — returns `false` otherwise (matches the pg `RETURNING` pattern).

Mutation serializability gives us correctness — no double-insert race.

---

## 7. Execution phases

### Phase 0 — scaffolding (½ day)
- `npx create-convex@latest --component chat-state-convex` → tear down what we don't need.
- Copy `package.json` exports structure, `tsconfig.build.json`, `vitest.config.mts`, and `eslint.config.js` shape from `get-convex/rate-limiter` as templates.
- Wire `"type": "module"`, `files: ["dist", "convex"]`, peer deps on `chat` and `convex`, keywords.
- Install `chat` and `convex` as peer + dev deps. Read `node_modules/chat/dist/index.d.ts` and write down the real `StateAdapter` interface signatures. **This is step 1 before any coding** — the docs site does not document state adapter method signatures.

### Phase 1 — component internals (2 days)
- `convex/schema.ts` with the five tables + indexes above.
- `subscriptions.ts`: `subscribe` (insert if not exists, on the `by_prefix_thread` index), `unsubscribe`, `isSubscribed`.
- `locks.ts`: `acquireLock`, `releaseLock` (token-gated patch/delete), `forceReleaseLock`, `extendLock`.
- `kv.ts`: `get` (lazy-expire on read, matching pg's opportunistic cleanup), `set` (upsert), `setIfNotExists` (returns bool; this is what Chat SDK uses for dedupe), `delete`.
- `lists.ts`: `appendToList` — insert with a fresh `seq`, then delete-overflow by `seq` ASC if `maxLength` set, then update `expiresAt` on all rows for the key (matches pg behavior, including TTL refresh). `getList` — paginated read via `by_prefix_key_seq`.
- `queues.ts`: `enqueue` (purge expired, insert, trim to `maxSize`, return depth), `dequeue` (purge expired, take oldest non-expired, delete + return), `queueDepth`.
- `crons.ts`: hourly `cleanupExpired` sweeping `locks`, `kv`, `lists`, `queues` via `by_expires` index.
- `convex.config.ts`: `defineComponent("chatState")`.

### Phase 2 — factory + client wiring (1 day)
- `ConvexStateAdapter implements StateAdapter` class. Mirror `PostgresStateAdapter` in `state-pg/src/index.ts` 1:1 — same method list, same signatures, same return shapes (`Lock`, `QueueEntry`).
- `createConvexState(options)` accepting:
  - `client: ConvexHttpClient | ConvexClient` (required — document this as the difference from Postgres/Redis; Convex apps already own the client)
  - `keyPrefix?: string` (default `"chat-sdk"`, matches pg)
  - `logger?: Logger` (default `new ConsoleLogger("info").child("convex")`, matches pg)
- `connect()` is a no-op that probes the deployment (one query); `disconnect()` also no-op (we don't own the client). Matches the `ensureConnected` pattern from `state-pg`.
- Each method calls `client.mutation(api.chatState.<file>.<fn>, args)` or `.query(...)`.
- Generate tokens with `crypto.randomUUID()` (pg uses `pg_${uuid}`; we'll use `cvx_${uuid}` for parity).
- Add a strict `const _typecheck: StateAdapter = new ConvexStateAdapter(...)` assertion in a test file so drift with `chat` is caught in CI.

### Phase 3 — tests (1.5 days)
Following https://chat-sdk.dev/docs/contributing/testing: vitest + `@vitest/coverage-v8`, with the structure used by official state adapters.

**Port the `state-memory` test file verbatim as the baseline** — those tests cover: subscribe/unsubscribe, acquire/release double-lock, wrong-token release rejected, re-lock after expiry, extendLock, forceReleaseLock, setIfNotExists (TTL-aware), appendToList with maxLength trim, getList TTL, TTL refresh on subsequent appends, enqueue/dequeue FIFO ordering, queueDepth, per-entry TTL in queues. Every one of these must pass against `ConvexStateAdapter` for interface parity.

- **Unit**: run the ported suite against `ConvexStateAdapter` backed by `convex-test` (which simulates the Convex runtime with the component's schema).
- **Integration**: spin up a real Chat instance with a mock platform adapter + `createConvexState`, run through mentions → subscribed-message → dedupe of replayed webhooks.
- **Coverage target**: ≥90% per `@vitest/coverage-v8` conventions used by official adapters.

### Phase 4 — example app + docs (1 day)
- `example/` with a minimal Slack bot using `createConvexState`. Mirrors rate-limiter's `example/` directory.
- `README.md` with: install, `convex.config.ts` snippet, factory usage, options table (same shape as postgres/redis docs), feature matrix, limitations (Node/Edge only, no `ctx.auth`, no env access inside component), migration path from Redis.
- `CHANGELOG.md` starting at `0.1.0`.
- Screenshots not required.

### Phase 5 — publishing + listing (½ day)
- `npm run build`, `npm run typecheck`, `npm test`, `npm pack --dry-run` — verify only `dist/` and `convex/` ship, and the exports map resolves.
- `npm publish --access public`.
- **Chat SDK listing**: community adapter listings currently appear on https://chat-sdk.dev/adapters without a documented submission form — open a PR or issue against the chat-sdk repo adding the row. Verify current process by checking how `chat-adapter-baileys` / `chat-state-cloudflare-do` got listed.
- **Convex components directory**: https://convex.dev/components has a submission flow — locate the "submit" link at publish time. Prepare the listing blurb in advance: one line, target audience, npm link, repo link.

---

## 8. Validation checklist before shipping

Pulled directly from the Chat SDK publishing + testing docs:

- [ ] `"type": "module"` in package.json
- [ ] `files: ["dist", "convex"]` only
- [ ] `exports` map covers `.` and `./convex.config.js`
- [ ] `peerDependencies` declares `chat` and `convex` with caret ranges
- [ ] `keywords` includes `chat-sdk`, `chat-adapter`, `convex-component`
- [ ] unit tests for every public method
- [ ] integration test hitting the full Chat → adapter → handler pipeline
- [ ] vitest + `@vitest/coverage-v8`
- [ ] `npm pack --dry-run` produces lean tarball (no `src/`, no `example/`, no test files)
- [ ] README mirrors option-table format used by the official adapters
- [ ] `example/` compiles and runs against a real Convex dev deployment
- [ ] `convex dev --typecheck-components` passes on example app

---

## 9. Resolved from source

All questions answered by reading `vercel/chat/packages/chat/src/types.ts` (lines 684–820) and the `get-convex/components-submissions-directory` README.

**Authoritative `StateAdapter` interface** (17 methods, exact signatures):

```ts
export interface StateAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(threadId: string): Promise<void>;
  unsubscribe(threadId: string): Promise<void>;
  isSubscribed(threadId: string): Promise<boolean>;
  acquireLock(threadId: string, ttlMs: number): Promise<Lock | null>;
  releaseLock(lock: Lock): Promise<void>;
  forceReleaseLock(threadId: string): Promise<void>;
  extendLock(lock: Lock, ttlMs: number): Promise<boolean>;
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
  setIfNotExists(key: string, value: unknown, ttlMs?: number): Promise<boolean>;
  delete(key: string): Promise<void>;
  appendToList(key: string, value: unknown, options?: { maxLength?: number; ttlMs?: number }): Promise<void>;
  getList<T = unknown>(key: string): Promise<T[]>;
  enqueue(threadId: string, entry: QueueEntry, maxSize: number): Promise<number>;
  dequeue(threadId: string): Promise<QueueEntry | null>;
  queueDepth(threadId: string): Promise<number>;
}

export interface Lock {
  expiresAt: number;
  threadId: string;
  token: string;
}

export interface QueueEntry {
  enqueuedAt: number;
  expiresAt: number;
  message: Message;  // full Message object, not opaque
}
```

`Message` is the Chat SDK normalized message type — serializable, so storing as JSON in the `queues` table works.

**Convex submission URL confirmed:** https://www.convex.dev/components/submit (review-based, no prizes). Categories include "Backend" and "Full-Stack Drop-In Features" — we fit "Backend" (or arguably "Third-Party Sync" since we sit between Convex and Chat SDK).

## 10. Can we reuse existing Convex components?

Surveyed the `get-convex/*` org. Candidates considered and rejected:

| Component | Considered for | Verdict |
|---|---|---|
| `@convex-dev/rate-limiter` | Locks | Different semantics (token bucket, not mutex with token-gated release). |
| `@convex-dev/action-cache` | KV with TTL | Wraps action results by args hash; our `get/set/setIfNotExists/delete` interface doesn't map. |
| `@convex-dev/workpool` | Queues | Workpool limits parallelism; Chat SDK queues are per-thread FIFO with size bound and per-entry TTL. Wrong shape. |
| `@convex-dev/crons` | Cleanup cron | Components already support native crons via `crons.ts`. No need for the runtime-configurable variant. |
| `@convex-dev/aggregate` | queueDepth | Overkill for a `count(*) where expiresAt > now()`. |

Decision: **write the primitives ourselves**. They're ~40 lines each and map directly from `state-pg` SQL. Composing mismatched components would add dependencies without simplifying code.

---

## 11. Risks

- **Chat SDK state interface changes between majors.** Pin peer dep range tightly (`^<current-major>`). Add CI job that reinstalls latest `chat` weekly and re-runs tests.
- **Component cron limitations.** If Convex restricts cron frequency or duration inside components, lazy-expire carries more weight — make sure every read path also expires stale rows.
- **`ConvexHttpClient` vs `ConvexClient` differences.** The factory should accept either; test both. The WebSocket client is better for low-latency webhook handling; the HTTP client is simpler for serverless.
- **Submission friction.** Chat SDK listing process isn't documented — may need to open a discussion/issue. Plan for ~1 week turnaround that we can't control.
