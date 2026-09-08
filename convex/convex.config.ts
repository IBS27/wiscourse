import { defineApp } from "convex/server";
import workpool from "@convex-dev/workpool/convex.config";

import agent from "@convex-dev/agent/convex.config";

const app = defineApp();
app.use(workpool, { name: "syncWorkpool" });
app.use(workpool, { name: "interpretationWorkpool" });
app.use(agent);

export default app;
