import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "reconcile-plans-with-autumn",
  { hourUTC: 2, minuteUTC: 0 },
  internal.billing._reconcilePlans,
  {},
);

crons.daily(
  "batch-send-access-restricted-emails",
  { hourUTC: 3, minuteUTC: 0 },
  internal.user._queueAccessRestrictedEmails,
  {},
);

crons.daily(
  "cleanup-old-webhook-events",
  { hourUTC: 4, minuteUTC: 0 },
  internal.webhook._cleanupOldEvents,
  {},
);

crons.weekly(
  "send-rotation-digest",
  { dayOfWeek: "monday", hourUTC: 9, minuteUTC: 0 },
  internal.rotation._sendWeeklyRotationDigests,
  {},
);

export default crons;
