"use client";

import type { Id } from "@repo/backend";
import { api } from "@repo/backend";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { dangerButton, secondaryButton } from "@/lib/styles";

interface RevokeApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
  apiKeyId: Id<"apiKey">;
  apiKeyName: string;
}

export function RevokeApiKeyDialog({
  open,
  onClose,
  apiKeyId,
  apiKeyName,
}: RevokeApiKeyDialogProps) {
  const revokeApiKey = useMutation(api.apiKey.revokeApiKey);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState("");

  const handleClose = () => {
    if (!isRevoking) onClose();
  };

  const handleRevoke = async () => {
    setIsRevoking(true);
    setError("");

    try {
      await revokeApiKey({ apiKeyId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} closeOnBackdrop={!isRevoking}>
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Revoke API key</h2>
          <p className="text-sm text-foreground/70 leading-relaxed">
            Are you sure you want to revoke{" "}
            <span className="font-medium text-foreground">&ldquo;{apiKeyName}&rdquo;</span>? Any
            applications or CI/CD pipelines using this key will lose access immediately. This action
            cannot be undone.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={isRevoking}
            className={`flex-1 p-2.5 text-sm ${secondaryButton}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={isRevoking}
            aria-busy={isRevoking}
            className={`flex-1 p-2.5 text-sm ${dangerButton}`}
          >
            {isRevoking ? "Revoking…" : "Revoke"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
