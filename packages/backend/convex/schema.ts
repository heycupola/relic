import { defineSchema } from "convex/server";

// The Better Auth component manages its own tables (users, sessions, etc.)
// This is just an empty schema for your app-specific tables
const schema = defineSchema({
  // Add your custom tables here if needed
});

export default schema;
