"use client";

import { Check, Copy } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { focusRing } from "@/lib/styles";

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Terminal",
  sh: "Terminal",
  shell: "Terminal",
  zsh: "Terminal",
  console: "Terminal",
  text: "Output",
  txt: "Output",
  json: "JSON",
  jsonc: "JSON",
  ts: "TypeScript",
  typescript: "TypeScript",
  js: "JavaScript",
  javascript: "JavaScript",
  tsx: "TSX",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  rust: "Rust",
  rs: "Rust",
  python: "Python",
  py: "Python",
  go: "Go",
  diff: "Diff",
  env: ".env",
  dotenv: ".env",
};

interface CodeBlockProps {
  language?: string;
  children: React.ReactNode;
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const { state, copy } = useCopyToClipboard();
  const label = language ? (LANGUAGE_LABELS[language] ?? language) : "Code";

  return (
    <div className="code-block overflow-hidden border-2 border-border bg-muted/30">
      <div className="flex items-center justify-between gap-3 border-b-2 border-border bg-background/60 py-1 pl-4 pr-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          onClick={() => copy(preRef.current?.innerText.trimEnd() ?? "")}
          aria-label={state === "copied" ? "Copied to clipboard" : "Copy code"}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-foreground hover:text-background ${focusRing}`}
        >
          {state === "copied" ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{state === "copied" ? "Copied" : state === "failed" ? "Failed" : "Copy"}</span>
        </button>
      </div>
      <pre
        ref={preRef}
        className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-relaxed text-foreground sm:px-5"
      >
        {children}
      </pre>
    </div>
  );
}
