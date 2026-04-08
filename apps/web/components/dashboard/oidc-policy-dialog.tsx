"use client";

import type { Id } from "@repo/backend";
import { api } from "@repo/backend";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/dialog";

interface OidcPolicyDialogProps {
  open: boolean;
  onClose: () => void;
  serviceAccountId: Id<"serviceAccount">;
  serviceAccountName: string;
  currentIssuer?: string;
  currentSubjectPattern?: string;
  currentAudience?: string;
}

type Provider = "github" | "gitlab";

const PROVIDERS: { id: Provider; label: string; issuer: string }[] = [
  { id: "github", label: "GitHub Actions", issuer: "https://token.actions.githubusercontent.com" },
  { id: "gitlab", label: "GitLab CI", issuer: "https://gitlab.com" },
];

function issuerToProvider(issuer?: string): Provider | null {
  if (!issuer) return null;
  return PROVIDERS.find((p) => p.issuer === issuer)?.id ?? null;
}

function parseExisting(
  issuer?: string,
  pattern?: string,
): { provider: Provider | null; org: string; repo: string; branch: string } {
  const provider = issuerToProvider(issuer);
  if (!pattern) return { provider, org: "", repo: "", branch: "" };

  if (provider === "github") {
    const match = pattern.match(/^repo:([^/]+)\/([^:]+):(.+)$/);
    if (match) {
      const ref = match[3];
      const branch =
        ref === "*" ? "*" : ref?.startsWith("ref:refs/heads/") ? ref.slice(15) : (ref ?? "");
      return { provider, org: match[1] ?? "", repo: match[2] ?? "", branch };
    }
  }

  if (provider === "gitlab") {
    const match = pattern.match(/^project_path:([^/]+)\/([^:]+):(.+)$/);
    if (match) {
      const ref = match[3];
      const branch =
        ref === "*" ? "*" : ref?.startsWith("ref_type:branch:ref:") ? ref.slice(20) : (ref ?? "");
      return { provider, org: match[1] ?? "", repo: match[2] ?? "", branch };
    }
  }

  return { provider, org: "", repo: "", branch: "" };
}

function buildPattern(provider: Provider, org: string, repo: string, branch: string): string {
  const branchPart = branch === "*" || branch === "" ? "*" : branch;

  if (provider === "github") {
    const ref = branchPart === "*" ? "*" : `ref:refs/heads/${branchPart}`;
    return `repo:${org}/${repo}:${ref}`;
  }

  const ref = branchPart === "*" ? "*" : `ref_type:branch:ref:${branchPart}`;
  return `project_path:${org}/${repo}:${ref}`;
}

export function OidcPolicyDialog({
  open,
  onClose,
  serviceAccountId,
  serviceAccountName,
  currentIssuer,
  currentSubjectPattern,
  currentAudience,
}: OidcPolicyDialogProps) {
  const updateOidcPolicy = useMutation(api.serviceAccount.updateOidcPolicy);
  const parsed = parseExisting(currentIssuer, currentSubjectPattern);

  const [provider, setProvider] = useState<Provider | null>(parsed.provider);
  const [org, setOrg] = useState(parsed.org);
  const [repo, setRepo] = useState(parsed.repo);
  const [branch, setBranch] = useState(parsed.branch || "*");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const hasExisting = !!currentIssuer;
  const isValid = !!provider && org.length > 0 && repo.length > 0;

  useEffect(() => {
    if (open) {
      const p = parseExisting(currentIssuer, currentSubjectPattern);
      setProvider(p.provider);
      setOrg(p.org);
      setRepo(p.repo);
      setBranch(p.branch || "*");
      setError("");
    }
  }, [open, currentIssuer, currentSubjectPattern]);

  const handleSave = async () => {
    if (!provider || !isValid) return;
    setIsSaving(true);
    setError("");

    const issuer = PROVIDERS.find((p) => p.id === provider)?.issuer;
    const pattern = buildPattern(provider, org, repo, branch);

    try {
      await updateOidcPolicy({
        serviceAccountId,
        oidcIssuer: issuer,
        oidcSubjectPattern: pattern,
        oidcAudience: currentAudience || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update OIDC policy");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
    setError("");

    try {
      await updateOidcPolicy({
        serviceAccountId,
        oidcIssuer: null,
        oidcSubjectPattern: null,
        oidcAudience: null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove OIDC policy");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">
            {hasExisting ? "Edit" : "Add"} OIDC Policy
          </h3>
          <p className="text-sm text-foreground/70 leading-relaxed">
            Configure OIDC trust for{" "}
            <span className="font-medium text-foreground">&ldquo;{serviceAccountName}&rdquo;</span>.
            When set, the service token only works from this CI environment.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <span className="text-xs text-foreground/60">Provider</span>
            <div className="flex gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={`flex-1 px-3 py-2 text-xs font-medium border transition-all ${
                    provider === p.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground/60 hover:border-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="oidc-org" className="text-xs text-foreground/60">
                {provider === "gitlab" ? "Group" : "Organization"}
              </label>
              <input
                id="oidc-org"
                type="text"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder={provider === "gitlab" ? "my-group" : "my-org"}
                className="w-full p-2.5 border border-border bg-background text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="oidc-repo" className="text-xs text-foreground/60">
                {provider === "gitlab" ? "Project" : "Repository"}
              </label>
              <input
                id="oidc-repo"
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder={provider === "gitlab" ? "my-project" : "my-repo"}
                className="w-full p-2.5 border border-border bg-background text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="oidc-branch" className="text-xs text-foreground/60">
              Branch <span className="text-foreground/30">(use * for all branches)</span>
            </label>
            <input
              id="oidc-branch"
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full p-2.5 border border-border bg-background text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground"
            />
          </div>

          {provider && org && repo && (
            <div className="px-3 py-2 bg-muted/30 border border-border/50">
              <p className="text-[11px] text-foreground/40 mb-1">Trust policy</p>
              <p className="text-xs font-mono text-foreground/60 break-all">
                {buildPattern(provider, org, repo, branch || "*")}
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          {hasExisting && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isSaving}
              className="p-2.5 border border-red-500/30 text-red-600 dark:text-red-400 text-sm hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 p-2.5 border border-border text-sm text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isValid}
            className="flex-1 p-2.5 border border-border bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
