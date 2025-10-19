import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "check-subscription-status",
  { hourUTC: 2, minuteUTC: 0 },
  internal.organization.checkAllSubscriptionStatus,
);

export default crons;
