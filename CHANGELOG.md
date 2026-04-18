# Changelog

## 0.2.0

### Minor Changes

- e6b6e51: Add `/test` entry point for `convex-test` integration.

  Consumers can now do:

  ```ts
  import chatState from "chat-state-convex-adapter/test";
  chatState.register(t);
  ```

  Exports a `register(t, name?)` helper plus the raw `schema` and `modules` glob, following the Convex authoring convention documented at https://docs.convex.dev/components/authoring.

### Patch Changes

- 541b263: Fix `ConvexClientLike` type and README instantiation example.
  - **`ConvexClientLike` was too narrow**: the previous hand-rolled interface used `(ref, args) => Promise<Ret>`, but the real `ConvexHttpClient.mutation` signature is `(ref, ...ArgsAndOptions<...>)`. Assigning a real client to the old type failed to typecheck. The new `ConvexClientLike` is the union of the actual `ConvexClient` and `ConvexHttpClient` classes imported from `convex/browser`, so users get full type-checking against the real APIs.
  - Added a compile-time regression test (`src/client/types.test.ts`) that asserts both real clients are assignable to `ConvexClientLike`. CI now catches this at the type level before a release ships.
  - **README fix**: Chat's generic doesn't expose `.state` publicly. The working pattern is to construct the adapter, `await state.connect()`, then pass `state` into `new Chat({ state })`. Updated the usage example.

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
