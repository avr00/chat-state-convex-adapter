---
"chat-state-convex-adapter": minor
---

Chat SDK 4.41 and Convex 1.46 support, plus TTL and cleanup fixes.

The `StateAdapter` contract is unchanged between `chat` 4.26 and 4.41, so no new methods were needed. The newer SDK features (per-user history via `bot.history.user` / `bot.transcripts`, the thread history cache, lock heartbeats, the `burst` strategy, and channel-scoped locks) all run on the existing primitives and now have tests that drive them through the SDK's own code. Peer ranges stay at `chat ^4.26.0` and `convex ^1.24.8`. Both are verified to typecheck, and no app-side changes are needed to upgrade.

**Fixes**

- **The cleanup cron could stall.** Rows stored without a TTL have no `expiresAt`, and a missing value sorts before every number in a Convex index, so the sweep's `lte(now)` range matched them first. With 200 or more such rows in `kv` or `lists` (per-user history without `retention`, adapter caches), the batch filled with rows that never expire and expired rows were never deleted. The range now starts at 0.
- **The cleanup cron couldn't keep up with busy bots.** It deleted at most 200 rows per table per hour, and every inbound message writes a dedupe key. A run that hits a full batch now schedules another run immediately until the backlog is gone.
- **`appendToList` could revive an expired list.** Appending to a list whose entries had expired, but hadn't been swept yet, refreshed their TTL and brought them back. Expired entries are now deleted before the append, so the list starts fresh. This matters for `history.user` with `retention` and for the thread history cache.
- **`ttlMs: 0` now means "no expiry"** for `set`, `setIfNotExists`, and `appendToList`, matching the memory, Redis, and Postgres adapters. Before, it made the row expire immediately.

**Other**

- `appendToList` reads the list once per call instead of three times.
- Dev tooling: `chat` 4.41, `convex` 1.46, `convex-test` 0.0.60, `vitest` 5, TypeScript 6.0. `_generated/` is regenerated with Convex 1.46.
- README: documents the supported SDK features, the TTL semantics, the cleanup behavior, and that `Chat` calls `state.connect()` itself.
