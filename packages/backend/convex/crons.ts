import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "check-subscription-status",
  { hourUTC: 2, minuteUTC: 0 },
  internal.organization.checkAllSubscriptionStatus,
);

crons.daily(
  "check-user-plan-status",
  { hourUTC: 3, minuteUTC: 0 },
  internal.user.checkAllUserPlanStatus,
);

export default crons;
