import { createContext, useContext } from "react";

interface AppSessionContextType {
  /** Logs out the user and resets session state */
  logout: () => Promise<void>;
  /** Current user's display name */
  displayName: string;
}

export const AppSessionContext = createContext<AppSessionContextType | null>(null);

/**
 * Hook to access app session functions like logout
 * Must be used within AppSessionProvider
 */
export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error("useAppSession must be used within AppSessionProvider");
  }
  return context;
}
