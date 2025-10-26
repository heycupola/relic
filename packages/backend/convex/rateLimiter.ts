import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  writeOperation: {
    kind: "token bucket",
    rate: 200,
    period: MINUTE,
    capacity: 50,
    shards: 5,
  },
  readOperation: {
    kind: "token bucket",
    rate: 500,
    period: MINUTE,
    capacity: 100,
    shards: 10,
  },
  deleteOperation: {
    kind: "token bucket",
    rate: 50,
    period: MINUTE,
    capacity: 10,
  },
  keyRotation: {
    kind: "token bucket",
    rate: 2,
    period: HOUR,
    capacity: 2,
  },
  bulkOperation: {
    kind: "token bucket",
    rate: 10,
    period: HOUR,
    capacity: 3,
  },
});
