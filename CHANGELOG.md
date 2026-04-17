# Changelog

## 0.1.0

Initial release.

- `ConvexStateAdapter` implementing all 17 Chat SDK `StateAdapter` methods
- Ships as a Convex Component with 5 isolated tables (subscriptions, locks, kv, lists, queues) and an hourly cleanup cron
- Wrapper template for the user's `convex/chatState.ts`
- 63 tests covering component and adapter layers at 97% line coverage
