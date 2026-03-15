import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const webhookSource = v.union(v.literal("stripe"), v.literal("resend"));

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

export const _cleanupOldEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - CLEANUP_AGE_MS;
    const oldEvents = await ctx.db
      .query("processedWebhook")
      .filter((q) => q.lt(q.field("processedAt"), cutoff))
      .collect();

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    return { deleted: oldEvents.length };
  },
});
