"use client";

import type { Id } from "@repo/backend";
import { api } from "@repo/backend";
import { useMutation } from "convex/react";
import { useState } from "react";
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

const PRESETS = [
  {
    label: "GitHub Actions",
    issuer: "https://token.actions.githubusercontent.com",
    subjectPlaceholder: "repo:org/repo:ref:refs/heads/main",
  },
  {
    label: "GitLab CI",
    issuer: "https://gitlab.com",
    subjectPlaceholder: "project_path:group/project:ref_type:branch:ref:main",
  },
];

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
  const [issuer, setIssuer] = useState(currentIssuer ?? "");
  const [subjectPattern, setSubjectPattern] = useState(currentSubjectPattern ?? "");
  const [audience, setAudience] = useState(currentAudience ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const hasExisting = !!currentIssuer;
  const hasChanges =
    issuer !== (currentIssuer ?? "") ||
    subjectPattern !== (currentSubjectPattern ?? "") ||
    audience !== (currentAudience ?? "");

  const isValid = (issuer && subjectPattern) || (!issuer && !subjectPattern);

  const handleSave = async () => {
    setIsSaving(true);
    setError("");

    try {
      await updateOidcPolicy({
        serviceAccountId,
        oidcIssuer: issuer || null,
        oidcSubjectPattern: subjectPattern || null,
        oidcAudience: audience || null,
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

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setIssuer(preset.issuer);
    if (!subjectPattern) setSubjectPattern("");
  };

  const handleClose = () => {
    setError("");
    setIsSaving(false);
    setIssuer(currentIssuer ?? "");
    setSubjectPattern(currentSubjectPattern ?? "");
    setAudience(currentAudience ?? "");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">
            {hasExisting ? "Edit" : "Add"} OIDC Policy
          </h3>
          <p className="text-sm text-foreground/70 leading-relaxed">
            Configure OIDC trust for{" "}
            <span className="font-medium text-foreground">&ldquo;{serviceAccountName}&rdquo;</span>.
            When set, the service token only works when paired with a valid OIDC token from the
            trusted provider.
          </p>
        </div>

        <div className="flex gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`px-2.5 py-1 text-xs border transition-all ${
                issuer === preset.issuer
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-foreground/60 hover:border-foreground hover:text-foreground"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="oidc-issuer" className="text-xs text-foreground/60">
              Issuer URL
            </label>
            <input
              id="oidc-issuer"
              type="url"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="https://token.actions.githubusercontent.com"
              className="w-full p-2.5 border border-border bg-background text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="oidc-subject" className="text-xs text-foreground/60">
              Subject pattern
            </label>
            <input
              id="oidc-subject"
              type="text"
              value={subjectPattern}
              onChange={(e) => setSubjectPattern(e.target.value)}
              placeholder={
                PRESETS.find((p) => p.issuer === issuer)?.subjectPlaceholder ??
                "repo:org/repo:ref:refs/heads/main"
              }
              className="w-full p-2.5 border border-border bg-background text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground font-mono"
            />
            <p className="text-[11px] text-foreground/40">
              Use <span className="font-mono">*</span> for wildcards, e.g.{" "}
              <span className="font-mono">repo:org/repo:*</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="oidc-audience" className="text-xs text-foreground/60">
              Audience <span className="text-foreground/30">(optional)</span>
            </label>
            <input
              id="oidc-audience"
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="relic"
              className="w-full p-2.5 border border-border bg-background text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground font-mono"
            />
          </div>
        </div>

        {!isValid && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            Both issuer and subject pattern are required, or leave both empty to remove.
          </p>
        )}

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
            onClick={handleClose}
            disabled={isSaving}
            className="flex-1 p-2.5 border border-border text-sm text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasChanges || !isValid}
            className="flex-1 p-2.5 border border-border bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
