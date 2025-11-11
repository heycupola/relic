import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { autumn } from "../autumn";

export async function checkOrganizationSuspended(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<void> {
  const settings = await ctx.db
    .query("organizationSetting")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first();

  if (!settings) {
    throw new Error("Organization settings not found");
  }

  if (settings.subscriptionStatus === "pending") {
    const now = Date.now();
    const timeRemaining = settings.paymentExpiresAt ? settings.paymentExpiresAt - now : 0;
    const minutesRemaining = Math.max(0, Math.floor(timeRemaining / (1000 * 60)));

    throw new Error(
      `Organization payment is pending. Complete payment within ${minutesRemaining} minutes or the organization will be deleted.`,
    );
  }

  if (settings.subscriptionStatus === "suspended") {
    // NOTE: free orgs should never be suspended - they remain active indefinitely
    // NOTE: if we encounter this, it's likely a data inconsistency, but allow access
    if (settings.isFreeWithProPlan) {
      return;
    }

    // NOTE: for paid orgs, check if subscription has been restored
    const orgCheck = await autumn.check(ctx, {
      entityId: organizationId,
      featureId: "organization_projects",
    });
    const isActive = orgCheck.data?.allowed || false;

    if (isActive) {
      // NOTE: subscription restored - instantly reactivate if in mutation context
      // NOTE: in query context, we can't patch, but the cron job will fix it soon
      if ("patch" in ctx.db) {
        await ctx.db.patch(settings._id, {
          subscriptionStatus: "active",
          paymentLapsedAt: undefined,
          suspendedAt: undefined,
          updatedAt: Date.now(),
        });
      }
    } else {
      throw new Error(
        "Organization is suspended. Please update your payment method to restore access.",
      );
    }
  }
}

export async function getOrganizationPaymentStatus(
  ctx: QueryCtx,
  organizationId: string,
): Promise<{
  status: "active" | "pending" | "payment_lapsed" | "suspended";
  daysRemaining?: number;
  minutesRemaining?: number;
  warning?: string;
}> {
  const settings = await ctx.db
    .query("organizationSetting")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first();

  if (!settings) {
    return { status: "active" };
  }

  if (settings.subscriptionStatus === "pending" && settings.paymentExpiresAt) {
    const now = Date.now();
    const timeRemaining = settings.paymentExpiresAt - now;
    const minutesRemaining = Math.max(0, Math.floor(timeRemaining / (1000 * 60)));
    return {
      status: "pending",
      minutesRemaining,
      warning: `Payment pending. Complete within ${minutesRemaining} minutes or organization will be deleted.`,
    };
  }

  if (settings.subscriptionStatus === "payment_lapsed" && settings.paymentLapsedAt) {
    const daysRemaining =
      7 - Math.floor((Date.now() - settings.paymentLapsedAt) / (1000 * 60 * 60 * 24));
    return {
      status: "payment_lapsed",
      daysRemaining: Math.max(0, daysRemaining),
      warning: `Payment failed. You have ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining before organization is suspended.`,
    };
  }

  return { status: settings.subscriptionStatus };
}

export async function checkProjectOrganizationSuspended(
  ctx: QueryCtx | MutationCtx,
  project: Doc<"project">,
): Promise<void> {
  // NOTE: only check if project is owned by an organization
  if (project.ownerType === "organization") {
    await checkOrganizationSuspended(ctx, project.ownerId);
  }
  // NOTE: if owned by user, no organization suspension check needed
}

export async function checkProjectIdOrganizationSuspended(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"project">,
): Promise<void> {
  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  await checkProjectOrganizationSuspended(ctx, project);
}
