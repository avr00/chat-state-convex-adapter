import { defineApp } from "convex/server";
import chatState from "../../src/component/convex.config.js";

const app = defineApp();
app.use(chatState);

export default app;
