import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "cleanup-expired-device-codes",
  { hourUTC: 3, minuteUTC: 0 },
  internal.deviceAuth._cleanupExpiredDeviceCodes,
  {},
);

export default crons;
