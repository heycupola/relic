import { describe, expect, test } from "vitest";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "../convex/_generated/dataModel";
import { createAuthOptions } from "../convex/auth";

describe("auth options", () => {
  test("clients cannot write user fields through Better Auth endpoints", () => {
    const fields = createAuthOptions({} as GenericCtx<DataModel>).user.additionalFields;
    const writable = Object.entries(fields)
      .filter(([, field]) => field.input !== false)
      .map(([name]) => name);
    expect(writable).toEqual([]);
  });
});
