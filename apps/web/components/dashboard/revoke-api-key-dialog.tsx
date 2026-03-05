"use client";

import type { Id } from "@repo/backend";
import { api } from "@repo/backend";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Dialog } from "@/components/dialog";

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
    <Dialog open={open} onClose={onClose}>
      <div className="p-3 border-b-2 border-border sm:p-4">
        <h2 className="text-sm font-semibold text-foreground">Revoke API Key</h2>
      </div>

      <div className="p-3 space-y-3 sm:p-4">
        <p className="text-sm text-foreground/70 leading-relaxed">
          Are you sure you want to revoke{" "}
          <span className="font-medium text-foreground">&ldquo;{apiKeyName}&rdquo;</span>?
        </p>
        <p className="text-xs text-foreground/50 leading-relaxed">
          Any applications or CI/CD pipelines using this key will lose access immediately. This
          action cannot be undone.
        </p>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="flex flex-col-reverse gap-2 p-3 border-t-2 border-border sm:flex-row sm:items-center sm:justify-end sm:p-4">
        <button
          type="button"
          onClick={onClose}
          disabled={isRevoking}
          className="px-4 py-2 text-sm text-foreground/60 hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleRevoke}
          disabled={isRevoking}
          className="px-4 py-2 text-sm font-medium border-2 border-red-600 dark:border-red-500 text-red-600 dark:text-red-400 hover:bg-red-600/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRevoking ? "Revoking…" : "Revoke"}
        </button>
      </div>
    </Dialog>
  );
}
