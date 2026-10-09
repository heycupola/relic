import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { createLogger } from "./lib/logger";
import { EmailKind } from "./lib/types";
import { sendEmail } from "./resend";

const log = createLogger("emails");

const emailData = v.union(
  v.object({
    kind: v.literal(EmailKind.AccessRestricted),
    userName: v.string(),
    ownedProjectCount: v.number(),
    sharedProjectCount: v.number(),
  }),
  v.object({
    kind: v.literal(EmailKind.CollaboratorAdded),
    userName: v.string(),
    projectName: v.string(),
    ownerName: v.string(),
  }),
  v.object({
    kind: v.literal(EmailKind.GracePeriodStarted),
    userName: v.string(),
    daysRemaining: v.number(),
  }),
  v.object({ kind: v.literal(EmailKind.PlanUpgraded), userName: v.string() }),
  v.object({ kind: v.literal(EmailKind.Welcome), userName: v.string() }),
);

/** Lets mutations send transactional email after they commit. */
export const _send = internalAction({
  args: { userId: v.string(), to: v.string(), data: emailData },
  handler: async (ctx, { userId, to, data }) => {
    try {
      await sendEmail(ctx, userId, to, data);
    } catch (error) {
      log.error("Failed to send email", { kind: data.kind, userId, error: String(error) });
    }
  },
});
