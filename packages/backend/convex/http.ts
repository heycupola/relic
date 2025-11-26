import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { stripe } from "./webhook";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

http.route({
  path: "/webhook/stripe",
  method: "POST",
  handler: stripe,
});

export default http;
