# Changelog

## 0.1.1

### Patch Changes

- 5497f2c: README: add pnpm, yarn, and bun install commands alongside npm.
- c1dce6e: Switch license to MIT (matches Chat SDK ecosystem).

  Expand the auth section of the README with a concrete example of
  enforcing `ctx.auth` in the user's wrapper mutations, and move the
  `ctx.auth`-inside-the-component note out of the limitations list
  (the workaround is standard and clean, not a real limitation).

## 0.1.0

Initial release.

- `ConvexStateAdapter` implementing all 17 Chat SDK `StateAdapter` methods
- Ships as a Convex Component with 5 isolated tables (subscriptions, locks, kv, lists, queues) and an hourly cleanup cron
- Wrapper template for the user's `convex/chatState.ts`
- 63 tests covering component and adapter layers at 97% line coverage
