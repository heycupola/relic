declare module "convex/react" {
  import type { ReactNode } from "react";

  export class ConvexReactClient {
    constructor(address: string);
    setAuth(fetchToken: () => Promise<string | null | undefined>): void;
    clearAuth(): void;
  }

  export interface ConvexProviderProps {
    client: ConvexReactClient;
    children: ReactNode;
  }

  export function ConvexProvider(props: ConvexProviderProps): ReactNode;

  export function useQuery<T = unknown>(
    query: unknown,
    args?: Record<string, unknown>,
  ): T | undefined;

  export function useMutation<T = unknown>(
    mutation: unknown,
  ): (args?: Record<string, unknown>) => Promise<T>;

  export function useAction<T = unknown>(
    action: unknown,
  ): (args?: Record<string, unknown>) => Promise<T>;

  export function useConvexAuth(): {
    isAuthenticated: boolean;
    isLoading: boolean;
  };
}
