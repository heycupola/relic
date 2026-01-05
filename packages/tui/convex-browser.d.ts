declare module "convex/browser" {
  export class ConvexHttpClient {
    constructor(address: string, options?: any);
    query(queryReference: any, args: any): Promise<any>;
    mutation(mutationReference: any, args: any): Promise<any>;
    action(actionReference: any, args: any): Promise<any>;
    setAuth(fetchToken: () => Promise<string | null | undefined>): void;
    clearAuth(): void;
  }
}
