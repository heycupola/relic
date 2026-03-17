import { Resend as ResendComponent } from "@convex-dev/resend";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { components } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { createLogger } from "./lib/logger";

const log = createLogger("resend");

import {
  AccessRestrictedEmail,
  AccountDeletedEmail,
  CollaboratorAddedEmail,
  GracePeriodStartedEmail,
  PlanUpgradedEmail,
  WelcomeEmail,
} from "./lib/emails/index";
import { EmailKind } from "./lib/types";

let _resendSdk: Resend | null = null;

export function getResendSdk(): Resend {
  if (!_resendSdk) {
    _resendSdk = new Resend(process.env.RESEND_API_KEY);
  }
  return _resendSdk;
}

export const resend: ResendComponent = new ResendComponent(components.resend, {});

const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS || "Relic <notifications@relic.so>";
const FROM_EMAIL_ADDRESS_PERSONAL =
  process.env.FROM_EMAIL_ADDRESS_PERSONAL || "Can from Relic <can@relic.so>";
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
      kind: EmailKind.AccountDeleted;
      userName: string;
      projectsDeleted: number;
      sharesRevoked: number;
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
    case EmailKind.AccountDeleted:
      return await render(
        AccountDeletedEmail({
          userName: data.userName,
          projectsDeleted: data.projectsDeleted,
          sharesRevoked: data.sharesRevoked,
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

function getFromAddress(kind: EmailKind): string {
  return kind === EmailKind.Welcome ? FROM_EMAIL_ADDRESS_PERSONAL : FROM_EMAIL_ADDRESS;
}

function getEmailSubject(kind: EmailKind): string {
  switch (kind) {
    case EmailKind.AccessRestricted:
      return "Your Relic access has been restricted";
    case EmailKind.AccountDeleted:
      return "Your Relic account has been deleted";
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

  const from = getFromAddress(data.kind);
  const subject = getEmailSubject(data.kind);
  const html = await renderEmailTemplate(data);

  const emailId = await resend.sendEmailManually(
    ctx,
    { from, to, subject },
    async (idempotencyKey: string) => {
      const { data: resendData, error } = await getResendSdk().emails.send({
        from,
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

export const sendEmailDirect = async (
  to: string,
  data: EmailData,
): Promise<{ emailId: string }> => {
  if (!process.env.RESEND_API_KEY) {
    return { emailId: "skipped" };
  }

  const from = getFromAddress(data.kind);
  const subject = getEmailSubject(data.kind);
  const html = await renderEmailTemplate(data);

  const { data: resendData, error } = await getResendSdk().emails.send({
    from,
    to,
    subject,
    html,
    tags: [{ name: "kind", value: data.kind }],
  });

  if (error) {
    log.error("Direct email send error", { kind: data.kind, to, error: error.message });
    return { emailId: "failed" };
  }

  log.info("Direct email sent", { kind: data.kind, to, emailId: resendData?.id });
  return { emailId: resendData?.id || "unknown" };
};
