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

  export const internal: {
    actionLog: any;
    auth: any;
    autumn: any;
    crons: any;
    deviceAuth: any;
    environment: any;
    folder: any;
    http: any;
    project: any;
    projectShare: any;
    rateLimiter: any;
    resend: any;
    secret: any;
    stripe: any;
    user: any;
    userKey: any;
    [key: string]: any;
  };
}
