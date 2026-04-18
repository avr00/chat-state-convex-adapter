---
"chat-state-convex-adapter": minor
---

Ergonomics pass — reduce friction for the two main usage shapes.

**`createConvexStateFromCtx({ ctx, component })` (new)** — a native-Convex adapter that runs inside an `httpAction`/`action` and calls the component via `ctx.runMutation`/`ctx.runQuery` directly. No wrapper file needed. This aligns with how `@convex-dev/rate-limiter` and `@convex-dev/twilio` are designed, and is the recommended path for users whose Chat SDK webhook handler is itself a Convex `httpAction`.

**`createChatStateWrappers({ mutation, query, component })` (new)** — a helper for the external-client path (Next.js webhook + `ConvexHttpClient`). Replaces the 150-line `convex-chatState.ts.template` copy with a single destructure. Convex codegen picks up the top-level named exports.

**`ChatStateAdapter` type alias** — re-exports `ConvexStateAdapter` under a name ergonomic for consumers annotating locals.

**Peer dep widened**: `convex: ^1.24.8` (was `^1.35.0`). Matches `@convex-dev/rate-limiter` and `@convex-dev/twilio`; the earlier pin was conservative after a type refactor that doesn't actually require 1.35.

**README rewrite**: two clear usage-pattern sections (Option A: inside Convex, Option B: external runtime) plus a new "Multi-tenant usage" section explaining that `keyPrefix` is a load-bearing isolation primitive, with the `${tenantId}:${workspaceId}:${platform}` convention.

The legacy `src/templates/convex-chatState.ts.template` file and the existing `createConvexState({ client, api })` export remain, so 0.2.x code keeps working.
