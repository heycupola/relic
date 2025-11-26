import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import autumn from "@useautumn/convex/convex.config";
import { defineApp } from "convex/server";
import betterAuth from "./betterAuth/convex.config.ts";

const app = defineApp();
app.use(betterAuth);
app.use(autumn);
app.use(rateLimiter);

export default app as ReturnType<typeof defineApp>;
