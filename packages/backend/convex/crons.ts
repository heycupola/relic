import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "batch-send-access-restricted-emails",
  { hourUTC: 3, minuteUTC: 0 },
  internal.user._batchSendAccessRestrictedEmails,
  {},
);

export default crons;
