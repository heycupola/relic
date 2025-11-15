import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "sweep-pending-organizations",
  { hourUTC: 2, minuteUTC: 0 },
  internal.organization.sweepPendingOrganizations,
  {},
);

export default crons;
