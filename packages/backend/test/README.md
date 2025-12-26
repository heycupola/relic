# Backend Test Guide

Convex backend test infrastructure. Use this guide when writing tests.

## Setup

At the beginning of each test file:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { createMockAutumn } from "./helpers/autumn.mock";
import { createTestUser } from "./helpers/setup";

const modules = import.meta.glob("../**/*.ts");

const mockAutumn = createMockAutumn(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return { customerId: identity.subject };
});

vi.mock("../autumn", () => ({
  autumn: mockAutumn,
}));

describe("my tests", () => {
  beforeEach(() => {
    mockAutumn.reset();
  });

  // Tests...
});
```

## Creating Test Users

```typescript
const t = convexTest(schema, modules);

const { userId, asUser } = await createTestUser(t, {
  authId: "user1",
  email: "user1@example.com",
  name: "Test User",
});

// Now you can call protected handlers
await asUser.mutation(api.project.createPersonalProject, { ... });
```

## Autumn Mock Usage

### User Features (personal_projects, free_org, etc.)

```typescript
// IMPORTANT: Use authId (not userId) because autumn.identify() returns subject (authId)
mockAutumn.setFeature("user1", "personal_projects", 2, 0);
//                     ^        ^                    ^  ^
//                     authId   feature              |  current usage
//                                                   limit
```

### Entity Features (organization_projects, members, etc.)

```typescript
// IMPORTANT: Use authId (not userId) for customerId
mockAutumn.setFeature("user1", orgId, "organization_projects", 10, 5);
//                    ^        ^      ^                        ^   ^
//                    authId   orgId  feature                  |   current
//                    (owner)                                  limit
```

### Boolean Features

```typescript
mockAutumn.setBooleanFeature("user1", "can_create_org", true);
mockAutumn.setEntityBooleanFeature("user1", orgId, "some_feature", false);
```

### Checking Usage

```typescript
const usage = mockAutumn.getUserFeature("user1", "personal_projects");
expect(usage?.current).toBe(3);
expect(usage?.limit).toBe(5);

const orgUsage = mockAutumn.getEntityFeature("user1", orgId, "organization_projects");
expect(orgUsage?.current).toBe(7);
```

## Example Test Pattern

```typescript
it("should create project when under limit", async () => {
  const t = convexTest(schema, modules);

  const { userId, asUser } = await createTestUser(t, {
    authId: "user1",
    email: "user1@example.com",
  });

  // Set autumn feature using authId (not userId!)
  mockAutumn.setFeature("user1", "personal_projects", 5, 2);

  // Call handler
  const result = await asUser.mutation(api.project.createPersonalProject, {
    name: "My Project",
    slug: "my-project",
  });

  // Assertions
  expect(result.success).toBe(true);

  // Verify usage tracking (use authId)
  const usage = mockAutumn.getUserFeature("user1", "personal_projects");
  expect(usage?.current).toBe(3); // 2 + 1
});
```

## Running Tests

```bash
bun test              # Watch mode
bun test:once         # Single run
bun test:coverage     # With coverage
```

## See project.test.ts

Check `project.test.ts` for a complete example. Write other tests using similar patterns.
