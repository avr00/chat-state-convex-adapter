---
"chat-state-convex-adapter": patch
---

Widen `ChatStateAdapter` type alias to cover both adapter variants.

Previously `ChatStateAdapter` aliased only `ConvexStateAdapter` (the HTTP-client variant). Consumers using `createConvexStateFromCtx` couldn't use the name for typing locals and fell back to `ReturnType<typeof createConvexStateFromCtx>`. Now:

```ts
export type ChatStateAdapter = ConvexCtxStateAdapter | ConvexStateAdapter;
```

One import works regardless of which factory the consumer chose.
