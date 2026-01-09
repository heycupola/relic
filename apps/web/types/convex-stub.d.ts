// Stub types for convex module - allows type checking without importing actual convex implementation
// biome-ignore-all lint/suspicious/noExplicitAny: Stub types intentionally use 'any' for flexibility
declare module "@/convex/_generated/api" {
  import type { FunctionReference } from "convex/server";

  // Use 'public' visibility for api (external) functions
  // biome-ignore lint/suspicious/noExplicitAny: Stub types require any for generic compatibility
  type PublicQuery = FunctionReference<"query", "public", any, any>;
  // biome-ignore lint/suspicious/noExplicitAny: Stub types require any for generic compatibility
  type PublicMutation = FunctionReference<"mutation", "public", any, any>;
  // biome-ignore lint/suspicious/noExplicitAny: Stub types require any for generic compatibility
  type PublicAction = FunctionReference<"action", "public", any, any>;
  type PublicFn = PublicQuery | PublicMutation | PublicAction;

  // Use 'internal' visibility for internal functions
  // biome-ignore lint/suspicious/noExplicitAny: Stub types require any for generic compatibility
  type InternalFn = FunctionReference<"query" | "mutation" | "action", "internal", any, any>;

  // Define known modules explicitly to avoid undefined errors
  interface ConvexPublicAPI {
    deviceAuth: {
      getDeviceCodeInfo: PublicQuery;
      approveDeviceCode: PublicMutation;
      denyDeviceCode: PublicMutation;
      [key: string]: PublicFn;
    };
    [module: string]: {
      [fn: string]: PublicFn;
    };
  }

  interface ConvexInternalAPI {
    [module: string]: {
      [fn: string]: InternalFn;
    };
  }

  export const api: ConvexPublicAPI;
  export const internal: ConvexInternalAPI;
}

declare module "@/convex/_generated/server" {
  export * from "convex/server";
}

declare module "@/convex/_generated/dataModel" {
  import type { GenericDataModel, GenericDocument } from "convex/server";
  export type DataModel = GenericDataModel;
  export type Doc<_TableName extends string> = GenericDocument;
  export type Id<TableName extends string> = string & {
    __tableName: TableName;
  };
}
