import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import resend from "@convex-dev/resend/convex.config.js";
import autumn from "@useautumn/convex/convex.config";
import { defineApp } from "convex/server";
import betterAuth from "./betterAuth/convex.config.ts";

const app = defineApp();
app.use(betterAuth);
app.use(autumn);
app.use(rateLimiter);
app.use(resend);

export default app as ReturnType<typeof defineApp>;
