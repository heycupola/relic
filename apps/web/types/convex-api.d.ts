// Type augmentation for Convex API
// This extends the generated API to include properties that may not be
// properly typed in the generated API file

declare module "@/convex/_generated/api" {
  export const api: {
    deviceAuth: {
      getDeviceCodeInfo: any;
      approveDeviceCode: any;
      denyDeviceCode: any;
    };
    autumn: any;
    [key: string]: any;
  };
}
