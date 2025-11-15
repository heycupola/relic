import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

const schema = defineSchema({
  ...tables,
  user: tables.user.index("by_email", ["email"]),
  organization: tables.organization.index("by_subscriptionStatus", ["subscriptionStatus"]),
  member: tables.member.index("by_organizationId", ["organizationId"]),
});

export default schema;
