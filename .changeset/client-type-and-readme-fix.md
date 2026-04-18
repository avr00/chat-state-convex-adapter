---
"chat-state-convex-adapter": patch
---

Fix `ConvexClientLike` type and README instantiation example.

- **`ConvexClientLike` was too narrow**: the previous hand-rolled interface used `(ref, args) => Promise<Ret>`, but the real `ConvexHttpClient.mutation` signature is `(ref, ...ArgsAndOptions<...>)`. Assigning a real client to the old type failed to typecheck. The new `ConvexClientLike` is the union of the actual `ConvexClient` and `ConvexHttpClient` classes imported from `convex/browser`, so users get full type-checking against the real APIs.
- Added a compile-time regression test (`src/client/types.test.ts`) that asserts both real clients are assignable to `ConvexClientLike`. CI now catches this at the type level before a release ships.
- **README fix**: Chat's generic doesn't expose `.state` publicly. The working pattern is to construct the adapter, `await state.connect()`, then pass `state` into `new Chat({ state })`. Updated the usage example.
