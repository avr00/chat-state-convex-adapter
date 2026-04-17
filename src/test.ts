/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import schema from "./component/schema.js";

const modules = import.meta.glob("./component/**/*.ts");

/**
 * Register the chatState component with a convex-test instance.
 *
 * @param t - The test convex instance from `convexTest(appSchema, appModules)`.
 * @param name - Component name as registered in your app's `convex.config.ts`.
 *               Defaults to `"chatState"` (the component's built-in name).
 *
 * @example
 * ```ts
 * import { convexTest } from "convex-test";
 * import chatState from "chat-state-convex-adapter/test";
 * import appSchema from "./schema.js";
 *
 * const appModules = import.meta.glob("./**\/*.ts");
 *
 * test("subscribe via wrapper", async () => {
 *   const t = convexTest(appSchema, appModules);
 *   chatState.register(t);
 *   // ... now call your wrapper mutations via t.mutation(api.chatState.subscribe, ...)
 * });
 * ```
 */
export function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name = "chatState"
): void {
  t.registerComponent(name, schema, modules);
}

export { modules, schema };
export default { modules, register, schema };
