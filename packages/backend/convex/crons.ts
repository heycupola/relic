import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "batch-send-access-restricted-emails",
  { hourUTC: 3, minuteUTC: 0 },
  internal.user._batchSendAccessRestrictedEmails,
  {},
);

crons.daily(
  "cleanup-old-webhook-events",
  { hourUTC: 4, minuteUTC: 0 },
  internal.webhook._cleanupOldEvents,
  {},
);

export default crons;
