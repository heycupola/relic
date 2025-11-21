import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "sweep-pending-organizations",
  { hourUTC: 2, minuteUTC: 0 },
  internal.organization._sweepPendingOrganizations,
  {},
);

crons.daily(
  "cleanup-expired-device-codes",
  { hourUTC: 3, minuteUTC: 0 },
  internal.deviceAuth._cleanupExpiredDeviceCodes,
  {},
);

crons.daily(
  "check-organization-subscriptions",
  { hourUTC: 2, minuteUTC: 0 },
  internal.organization._checkOrganizationSubscriptions,
);

export default crons;
