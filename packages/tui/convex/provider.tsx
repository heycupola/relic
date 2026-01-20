import { ConvexProvider, ConvexReactClient } from "convex/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { logger } from "../utils/debugLog";
import { ensureValidJwt } from "./services/jwt";

const CONVEX_URL = process.env.CONVEX_URL ?? "http://localhost:3210";

// Single shared client instance
const convexClient = new ConvexReactClient(CONVEX_URL);

interface ConvexAuthProviderProps {
  children: ReactNode;
}

export function ConvexAuthProvider({ children }: ConvexAuthProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const setupCompleteRef = useRef(false);

  useEffect(() => {
    if (setupCompleteRef.current) return;

    const setupAuth = async () => {
      try {
        // Verify we can get a token first
        await ensureValidJwt();

        // Set up the auth callback for Convex
        convexClient.setAuth(async () => {
          try {
            return await ensureValidJwt();
          } catch (err) {
            logger.error("Failed to get JWT for Convex auth:", err);
            return null;
          }
        });

        setupCompleteRef.current = true;
        setIsReady(true);
        logger.debug("Convex auth provider ready");
      } catch (err) {
        logger.error("Failed to setup Convex auth:", err);
        // Still render children - HTTP client will work as fallback
        setIsReady(true);
      }
    };

    setupAuth();
  }, []);

  if (!isReady) {
    return null;
  }

  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
}

export function getConvexReactClient() {
  return convexClient;
}
