import { Resend as ResendComponent } from "@convex-dev/resend";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { components } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { createLogger } from "./lib/logger";

const log = createLogger("resend");

import {
  AccessRestrictedEmail,
  CollaboratorAddedEmail,
  GracePeriodStartedEmail,
  PlanUpgradedEmail,
  WelcomeEmail,
} from "./lib/emails/index";
import { EmailKind } from "./lib/types";

export const resendSdk = new Resend(process.env.RESEND_API_KEY);

export const resend: ResendComponent = new ResendComponent(components.resend, {});

const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS || "Can Vardar <can@relic.so>";
const SITE_URL =
  process.env.SITE_URL ||
  (process.env.ENVIRONMENT === "development" ? "http://localhost:3000" : "https://relic.so");

export const getUpgradeUrl = () => `${SITE_URL}/upgrade`;
export const getDashboardUrl = () => `${SITE_URL}/dashboard`;

type EmailData =
  | {
      kind: EmailKind.AccessRestricted;
      userName: string;
      ownedProjectCount: number;
      sharedProjectCount: number;
    }
  | {
      kind: EmailKind.CollaboratorAdded;
      userName: string;
      projectName: string;
      ownerName: string;
    }
  | {
      kind: EmailKind.GracePeriodStarted;
      userName: string;
      daysRemaining: number;
    }
  | {
      kind: EmailKind.PlanUpgraded;
      userName: string;
    }
  | {
      kind: EmailKind.Welcome;
      userName: string;
    };

async function renderEmailTemplate(data: EmailData): Promise<string> {
  switch (data.kind) {
    case EmailKind.AccessRestricted:
      return await render(
        AccessRestrictedEmail({
          userName: data.userName,
          ownedProjectCount: data.ownedProjectCount,
          sharedProjectCount: data.sharedProjectCount,
          upgradeUrl: getUpgradeUrl(),
        }),
      );
    case EmailKind.CollaboratorAdded:
      return await render(
        CollaboratorAddedEmail({
          userName: data.userName,
          projectName: data.projectName,
          ownerName: data.ownerName,
          dashboardUrl: getDashboardUrl(),
        }),
      );
    case EmailKind.GracePeriodStarted:
      return await render(
        GracePeriodStartedEmail({
          userName: data.userName,
          daysRemaining: data.daysRemaining,
          upgradeUrl: getUpgradeUrl(),
        }),
      );
    case EmailKind.PlanUpgraded:
      return await render(
        PlanUpgradedEmail({
          userName: data.userName,
          dashboardUrl: getDashboardUrl(),
        }),
      );
    case EmailKind.Welcome:
      return await render(
        WelcomeEmail({
          userName: data.userName,
          dashboardUrl: getDashboardUrl(),
        }),
      );
  }
}

function getEmailSubject(kind: EmailKind): string {
  switch (kind) {
    case EmailKind.AccessRestricted:
      return "Your Relic access has been restricted";
    case EmailKind.CollaboratorAdded:
      return "You've been added to a project";
    case EmailKind.GracePeriodStarted:
      return "Your Relic plan has changed";
    case EmailKind.PlanUpgraded:
      return "Welcome to Relic Pro";
    case EmailKind.Welcome:
      return "Welcome to Relic";
  }
}

export const sendEmail = async (
  ctx: ActionCtx,
  userId: string,
  to: string,
  data: EmailData,
): Promise<{ emailId: string }> => {
  if (!process.env.RESEND_API_KEY) {
    return { emailId: "skipped" };
  }

  const subject = getEmailSubject(data.kind);
  const html = await renderEmailTemplate(data);

  const emailId = await resend.sendEmailManually(
    ctx,
    { from: FROM_EMAIL_ADDRESS, to, subject },
    async (idempotencyKey: string) => {
      const { data: resendData, error } = await resendSdk.emails.send({
        from: FROM_EMAIL_ADDRESS,
        to,
        subject,
        html,
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        tags: [
          { name: "userId", value: userId },
          { name: "kind", value: data.kind },
          { name: "emailId", value: idempotencyKey },
        ],
      });

      if (error) {
        log.error("Resend API error", { kind: data.kind, to, error: error.message });
        throw new Error(`Failed to send: ${error.message}`);
      }

      if (!resendData?.id) {
        log.error("No email ID returned from Resend", { kind: data.kind, to });
        throw new Error("No email ID returned from Resend");
      }

      return resendData.id;
    },
  );

  log.info("Email sent", { kind: data.kind, to, emailId });

  return { emailId };
};
