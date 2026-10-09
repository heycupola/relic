import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "../_generated/dataModel";
import { createAuth } from "../auth";

// Static instance for the Better Auth CLI schema generator, which never touches the context.
export const auth = createAuth({} as GenericCtx<DataModel>);
