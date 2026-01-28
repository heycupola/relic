import { ensureValidJwt } from "@repo/auth";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { logger } from "../utils/debugLog";

const CONVEX_URL = process.env.CONVEX_URL ?? "http://localhost:3210";
const convexClient = new ConvexReactClient(CONVEX_URL);

interface ConvexAuthProviderProps {
  children: ReactNode;
}

function TypedConvexProvider(props: ComponentProps<typeof ConvexProvider>) {
  return ConvexProvider(props) as ReactNode;
}

export function ConvexAuthProvider({ children }: ConvexAuthProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const setupCompleteRef = useRef(false);

  useEffect(() => {
    if (setupCompleteRef.current) return;

    const setupAuth = async () => {
      try {
        await ensureValidJwt();

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
        setIsReady(true);
      }
    };

    setupAuth();
  }, []);

  if (!isReady) {
    return null;
  }

  return <TypedConvexProvider client={convexClient}>{children}</TypedConvexProvider>;
}

export function getConvexReactClient() {
  return convexClient;
}
