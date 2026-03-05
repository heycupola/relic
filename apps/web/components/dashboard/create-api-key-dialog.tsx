"use client";

import { ApiKeyScope, api } from "@repo/backend";
import { cn } from "@repo/ui/lib/utils";
import { useMutation } from "convex/react";
import { Check, Copy, X } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/dialog";

interface CreateApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
  activeKeyCount: number;
}

const MAX_KEYS = 5;

const AVAILABLE_SCOPES = [
  {
    id: ApiKeyScope.SecretsRead,
    label: "secrets.read",
    description: "Read and export secrets via API",
  },
  {
    id: ApiKeyScope.UserKeysRead,
    label: "user.keys.read",
    description: "Read user encryption keys for decryption",
  },
];

export function CreateApiKeyDialog({ open, onClose, activeKeyCount }: CreateApiKeyDialogProps) {
  const createApiKey = useMutation(api.apiKey.createApiKey);

  const [step, setStep] = useState<"form" | "reveal">("form");
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(
    new Set(AVAILABLE_SCOPES.map((s) => s.id)),
  );
  const [expiration, setExpiration] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [copied, setCopied] = useState(false);

  const canCreate = name.trim().length > 0 && selectedScopes.size > 0 && activeKeyCount < MAX_KEYS;

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scopeId)) {
        next.delete(scopeId);
      } else {
        next.add(scopeId);
      }
      return next;
    });
  };

  const reset = () => {
    setStep("form");
    setName("");
    setSelectedScopes(new Set(AVAILABLE_SCOPES.map((s) => s.id)));
    setExpiration("");
    setIsCreating(false);
    setError("");
    setCreatedKey("");
    setCopied(false);
  };

  const handleCreate = async () => {
    if (!canCreate || isCreating) return;

    setIsCreating(true);
    setError("");

    try {
      const scopes = Array.from(selectedScopes);

      const expiresAt = expiration
        ? Date.now() + Number.parseInt(expiration, 10) * 24 * 60 * 60 * 1000
        : undefined;

      const result = await createApiKey({ name: name.trim(), scopes, expiresAt });
      setCreatedKey(result.apiKey);
      setStep("reveal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={
        step === "reveal"
          ? () => {
              /* noop during key reveal */
            }
          : handleClose
      }
      closeOnBackdrop={step !== "reveal"}
    >
      {step === "form" ? (
        <>
          <div className="flex items-center justify-between p-3 border-b-2 border-border sm:p-4">
            <h2 className="text-sm font-semibold text-foreground">Create API Key</h2>
            <button
              type="button"
              onClick={handleClose}
              className="text-foreground/40 hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <div className="p-3 space-y-4 sm:p-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="api-key-name"
                  className="text-xs font-medium text-foreground/60 block"
                >
                  Name
                </label>
                <input
                  id="api-key-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. GitHub Actions"
                  autoFocus
                  className="w-full p-2.5 border border-border bg-transparent text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground/60">Permissions</p>
                <div className="border border-border divide-y divide-border">
                  {AVAILABLE_SCOPES.map((scope) => {
                    const checked = selectedScopes.has(scope.id);
                    return (
                      <button
                        key={scope.id}
                        type="button"
                        onClick={() => toggleScope(scope.id)}
                        className="flex items-center gap-3 w-full p-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div
                          className={cn(
                            "h-4 w-4 shrink-0 border-2 flex items-center justify-center transition-colors",
                            checked
                              ? "bg-foreground border-foreground"
                              : "bg-transparent border-border",
                          )}
                        >
                          {checked && <Check className="h-3 w-3 text-background" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-foreground font-mono">{scope.label}</span>
                          <p className="text-xs text-foreground/50 mt-0.5">{scope.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="api-key-expiration"
                  className="text-xs font-medium text-foreground/60 block"
                >
                  Expiration
                </label>
                <select
                  id="api-key-expiration"
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  className="w-full p-2.5 border border-border bg-background text-sm text-foreground focus:border-foreground focus:outline-none transition-colors cursor-pointer"
                >
                  <option value="">No expiration</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <div className="flex flex-col-reverse gap-2 p-3 border-t-2 border-border sm:flex-row sm:items-center sm:justify-end sm:p-4">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm text-foreground/60 hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canCreate || isCreating}
                className="px-4 py-2 text-sm font-medium border-2 border-foreground bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? "Creating…" : "Create Key"}
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <div className="p-3 border-b-2 border-border sm:p-4">
            <h2 className="text-sm font-semibold text-foreground">API Key Created</h2>
          </div>

          <div className="p-3 space-y-4 sm:p-4">
            <div className="flex items-start gap-2 p-3 border border-yellow-600/30 bg-yellow-600/5">
              <span className="text-yellow-600 dark:text-yellow-400 text-xs shrink-0">⚠</span>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 leading-relaxed">
                Copy this key now. It will only be shown once and cannot be retrieved later.
              </p>
            </div>

            <div className="relative">
              <div className="p-3 border border-border bg-muted/30 font-mono text-xs text-foreground break-all pr-10 leading-relaxed select-all">
                {createdKey}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="absolute top-2.5 right-2.5 p-1 text-foreground/40 hover:text-foreground transition-colors"
                aria-label={copied ? "Copied" : "Copy to clipboard"}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end p-3 border-t-2 border-border sm:p-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium border-2 border-foreground bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              Done
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
