"use client";

import type { Id } from "@repo/backend";
import { api } from "@repo/backend";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { dangerButton, secondaryButton } from "@/lib/styles";

interface RevokeServiceAccountDialogProps {
  open: boolean;
  onClose: () => void;
  serviceAccountId: Id<"serviceAccount">;
  serviceAccountName: string;
}

export function RevokeServiceAccountDialog({
  open,
  onClose,
  serviceAccountId,
  serviceAccountName,
}: RevokeServiceAccountDialogProps) {
  const revokeServiceAccount = useMutation(api.serviceAccount.revokeServiceAccount);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState("");

  const handleClose = () => {
    if (!isRevoking) onClose();
  };

  const handleRevoke = async () => {
    setIsRevoking(true);
    setError("");

    try {
      await revokeServiceAccount({ serviceAccountId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke service account");
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} closeOnBackdrop={!isRevoking}>
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Revoke service account</h2>
          <p className="text-sm text-foreground/70 leading-relaxed">
            Are you sure you want to revoke{" "}
            <span className="font-medium text-foreground">&ldquo;{serviceAccountName}&rdquo;</span>?
            Any CI/CD pipelines using this service token will lose access immediately. This action
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
