import { createContext, useContext } from "react";

interface AppSessionContextType {
  logout: () => Promise<void>;
  displayName: string;
  /** Drops the unlocked state so the user must enter their password again. */
  requireUnlock: () => void;
}

export const AppSessionContext = createContext<AppSessionContextType | null>(null);

export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error("useAppSession must be used within AppSessionProvider");
  }
  return context;
}
