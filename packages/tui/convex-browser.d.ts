declare module "convex/browser" {
  export class ConvexHttpClient {
    constructor(address: string, options?: Record<string, unknown>);
    query<T = unknown>(queryReference: string, args: Record<string, unknown>): Promise<T>;
    mutation<T = unknown>(mutationReference: string, args: Record<string, unknown>): Promise<T>;
    action<T = unknown>(actionReference: string, args: Record<string, unknown>): Promise<T>;
    setAuth(fetchToken: () => Promise<string | null | undefined>): void;
    clearAuth(): void;
  }
}
