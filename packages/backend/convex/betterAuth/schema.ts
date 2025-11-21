import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

const schema = defineSchema({
  ...tables,
  user: tables.user.index("by_email", ["email"]),
  organization: tables.organization.index("by_subscriptionStatus", ["subscriptionStatus"]),
  member: tables.member
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_role", ["organizationId", "role"]),
  deviceCode: tables.deviceCode
    .index("by_deviceCode", ["deviceCode"])
    .index("by_userCode", ["userCode"])
    .index("by_expiresAt", ["expiresAt"]),
});

export default schema;
