import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

const schema = defineSchema({
  ...tables,
  user: tables.user
    .index("by_email", ["email"])
    .index("by_planDowngradedAt", ["planDowngradedAt"])
    .index("by_hasPro", ["hasPro"]),
  deviceCode: tables.deviceCode
    .index("by_userId", ["userId"])
    .index("by_deviceCode", ["deviceCode"])
    .index("by_userCode", ["userCode"])
    .index("by_expiresAt", ["expiresAt"]),
});

export default schema;
