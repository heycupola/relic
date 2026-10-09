import { api } from "@repo/backend";
import { useAction } from "convex/react";
import { useCallback, useState } from "react";
import { trackWebEvent } from "@/lib/posthog";

type CheckoutResult = "redirecting" | "already_pro" | "error";

/** Starts Pro checkout and redirects to Autumn, or reports that the user is already on Pro. */
export function useProCheckout() {
  const getProPlan = useAction(api.user.getProPlan);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = useCallback(async (): Promise<CheckoutResult> => {
    setIsPending(true);
    setError(null);
    trackWebEvent("web_upgrade_started");

    try {
      const result = await getProPlan({});
      if (result.hasPro) {
        setIsPending(false);
        return "already_pro";
      }
      if (result.checkoutLink) {
        window.location.assign(result.checkoutLink);
        return "redirecting";
      }
      throw new Error("Could not create a checkout link. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setIsPending(false);
      return "error";
    }
  }, [getProPlan]);

  return { startCheckout, isPending, error, clearError: () => setError(null) };
}
