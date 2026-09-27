/**
 * Compile-time regression tests. These don't need to run; they need to
 * typecheck. If Convex or Chat SDK change their public types in a way that
 * breaks one of these assignments, CI fails on `tsc --noEmit` before a release
 * can sneak out with a broken public API.
 */
import type { ChatConfig, StateAdapter } from "chat";
import type { ConvexClient, ConvexHttpClient } from "convex/browser";
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
} from "convex/server";
import { test } from "vitest";
import type { ComponentApi } from "../component/_generated/component.js";
import type { RunComponentCtx } from "./ctx.js";
import type { ChatStateAdapter, ConvexClientLike } from "./index.js";

test("ConvexHttpClient is assignable to ConvexClientLike", () => {
  const _check = (c: ConvexHttpClient): ConvexClientLike => c;
  void _check;
});

test("ConvexClient is assignable to ConvexClientLike", () => {
  const _check = (c: ConvexClient): ConvexClientLike => c;
  void _check;
});

test("an app's action and mutation ctx satisfy RunComponentCtx", () => {
  const _action = (c: GenericActionCtx<GenericDataModel>): RunComponentCtx =>
    c;
  const _mutation = (
    c: GenericMutationCtx<GenericDataModel>
  ): RunComponentCtx => c;
  void _action;
  void _mutation;
});

test("the mounted component reference satisfies ComponentApi", () => {
  // Codegen types `components.chatState` as `ComponentApi<"chatState">`.
  const _check = (c: ComponentApi<"chatState">): ComponentApi => c;
  void _check;
});

test("both adapter variants are Chat SDK state adapters", () => {
  const _state = (s: ChatStateAdapter): StateAdapter => s;
  const _config = (s: ChatStateAdapter): ChatConfig["state"] => s;
  void _state;
  void _config;
});
