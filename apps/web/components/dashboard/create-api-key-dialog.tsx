"use client";

import { ApiKeyScope, api } from "@repo/backend";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { MAX_API_KEYS } from "@/lib/plans";
import { focusRing, primaryButton, secondaryButton } from "@/lib/styles";

interface CreateApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
  activeKeyCount: number;
}

const EXPIRATION_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

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
  const titleId = useId();
  const createApiKey = useMutation(api.apiKey.createApiKey);
  const projectsData = useQuery(api.project.listUserProjects, open ? {} : "skip");

  const [step, setStep] = useState<"form" | "reveal">("form");
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(
    new Set(AVAILABLE_SCOPES.map((s) => s.id)),
  );
  const [expiration, setExpiration] = useState("30");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [copied, setCopied] = useState(false);

  const canCreate =
    name.trim().length > 0 && selectedScopes.size > 0 && activeKeyCount < MAX_API_KEYS;

  const projectOptions = [
    { value: "", label: "All projects" },
    ...(projectsData?.projects ?? [])
      .filter((p) => p.status === "owned" && !p.isArchived)
      .map((p) => ({ value: String(p.id), label: p.name })),
  ];

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
    setExpiration("30");
    setSelectedProjectId("");
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
      const expiresAt = Date.now() + Number.parseInt(expiration, 10) * 24 * 60 * 60 * 1000;
      const projectId = selectedProjectId || undefined;

      const result = await createApiKey({
        name: name.trim(),
        scopes,
        expiresAt,
        projectId: projectId as Parameters<typeof createApiKey>[0]["projectId"],
      });
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
      closeOnBackdrop={step !== "reveal" && !isCreating}
      labelledBy={titleId}
    >
      {step === "form" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <h2 id={titleId} className="text-base font-semibold text-foreground">
                Create API key
              </h2>
              <p className="text-sm text-foreground/70 leading-relaxed">
                Generate a key to access your secrets programmatically via the API.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="api-key-name" className="text-sm text-foreground/70">
                Name
              </label>
              <input
                id="api-key-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. GitHub Actions"
                autoFocus
                autoComplete="off"
                className="w-full p-2.5 border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground"
              />
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm text-foreground/70 mb-1.5">Permissions</legend>
              <div className="border border-border divide-y divide-border">
                {AVAILABLE_SCOPES.map((scope) => {
                  const checked = selectedScopes.has(scope.id);
                  const descriptionId = `api-key-scope-${scope.id}-description`;
                  return (
                    <label
                      key={scope.id}
                      className="flex items-center gap-3 w-full p-3 text-left hover:bg-muted/50 has-[:focus-visible]:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScope(scope.id)}
                        aria-describedby={descriptionId}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-4 w-4 shrink-0 border-2 flex items-center justify-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground",
                          checked
                            ? "bg-foreground border-foreground"
                            : "bg-transparent border-foreground/40",
                        )}
                      >
                        {checked && <Check className="h-3 w-3 text-background" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm text-foreground font-mono">{scope.label}</span>
                        <span
                          id={descriptionId}
                          className="block text-xs text-muted-foreground mt-0.5"
                        >
                          {scope.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor="api-key-project" className="block text-sm text-foreground/70">
                Project scope
              </label>
              <Select
                id="api-key-project"
                value={selectedProjectId}
                onChange={setSelectedProjectId}
                options={projectOptions}
                aria-describedby="api-key-project-hint"
              />
              <p id="api-key-project-hint" className="text-xs text-muted-foreground">
                {selectedProjectId
                  ? "This key can only access the selected project."
                  : "This key can access all your projects."}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="api-key-expiration" className="block text-sm text-foreground/70">
                Expiration
              </label>
              <Select
                id="api-key-expiration"
                value={expiration}
                onChange={setExpiration}
                options={EXPIRATION_OPTIONS}
              />
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
                disabled={isCreating}
                className={`flex-1 p-2.5 text-sm ${secondaryButton}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canCreate || isCreating}
                aria-busy={isCreating}
                className={`flex-1 p-2.5 text-sm ${primaryButton}`}
              >
                {isCreating ? "Creating…" : "Create key"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              API key created
            </h2>
            <p className="text-sm text-foreground/70 leading-relaxed">
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
              autoFocus
              className={`absolute top-2.5 right-2.5 p-1 text-muted-foreground hover:text-foreground transition-colors ${focusRing}`}
              aria-label={copied ? "Copied" : "Copy API key"}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <span className="sr-only" aria-live="polite">
              {copied && "API key copied to clipboard"}
            </span>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className={`flex-1 p-2.5 text-sm ${primaryButton}`}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
