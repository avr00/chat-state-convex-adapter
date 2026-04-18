/**
 * Compile-time regression tests. These don't need to run; they need to
 * typecheck. If Convex widens or narrows its client signatures in a way that
 * breaks either assignment, CI fails on `tsc --noEmit` before a release
 * can sneak out with a broken public API.
 */
import type { ConvexClient, ConvexHttpClient } from "convex/browser";
import { test } from "vitest";
import type { ConvexClientLike } from "./index.js";

test("ConvexHttpClient is assignable to ConvexClientLike", () => {
  const _check = (c: ConvexHttpClient): ConvexClientLike => c;
  void _check;
});

test("ConvexClient is assignable to ConvexClientLike", () => {
  const _check = (c: ConvexClient): ConvexClientLike => c;
  void _check;
});
