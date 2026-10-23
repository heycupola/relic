"use client";

import { Check, Link2 } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { rowActionButton } from "@/lib/styles";

export function CopyLinkButton({ url }: { url: string }) {
  const { state, copy } = useCopyToClipboard();

  return (
    <button type="button" onClick={() => copy(url)} className={rowActionButton}>
      {state === "copied" ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span aria-live="polite">
        {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed" : "Copy link"}
      </span>
    </button>
  );
}
