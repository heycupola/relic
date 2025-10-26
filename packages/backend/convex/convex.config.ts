import betterAuth from "@convex-dev/better-auth/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import autumn from "@useautumn/convex/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(betterAuth);
app.use(autumn);
app.use(rateLimiter);

export default app as ReturnType<typeof defineApp>;
