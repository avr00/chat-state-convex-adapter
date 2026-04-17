---
"chat-state-convex-adapter": minor
---

Add `/test` entry point for `convex-test` integration.

Consumers can now do:

```ts
import chatState from "chat-state-convex-adapter/test";
chatState.register(t);
```

Exports a `register(t, name?)` helper plus the raw `schema` and `modules` glob, following the Convex authoring convention documented at https://docs.convex.dev/components/authoring.
