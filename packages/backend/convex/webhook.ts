import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

const webhookSource = v.union(v.literal("autumn"), v.literal("resend"));

export const _isProcessed = internalQuery({
  args: { eventId: v.string(), source: webhookSource },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processedWebhook")
      .withIndex("by_eventId_source", (q) =>
        q.eq("eventId", args.eventId).eq("source", args.source),
      )
      .first();
    return !!existing;
  },
});

export const _markProcessed = internalMutation({
  args: { eventId: v.string(), source: webhookSource },
  handler: async (ctx, args) => {
    await ctx.db.insert("processedWebhook", {
      eventId: args.eventId,
      source: args.source,
      processedAt: Date.now(),
    });
  },
});

const CLEANUP_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours

const CLEANUP_BATCH_SIZE = 500;

export const _cleanupOldEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - CLEANUP_AGE_MS;
    const oldEvents = await ctx.db
      .query("processedWebhook")
      .withIndex("by_processedAt", (q) => q.lt("processedAt", cutoff))
      .take(CLEANUP_BATCH_SIZE);

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    if (oldEvents.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.webhook._cleanupOldEvents, {});
    }

    return { deleted: oldEvents.length };
  },
});
