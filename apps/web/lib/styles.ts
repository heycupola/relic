export const authHeadingStyle = {
  fontFamily: "var(--font-space-grotesk, sans-serif)",
  lineHeight: "1.1",
} as const;

export const authSubtitleStyle = {
  lineHeight: "1.4",
} as const;

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const disabledState = "disabled:opacity-50 disabled:cursor-not-allowed";

export const primaryButton = `border-2 border-foreground bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors ${disabledState} ${focusRing}`;

export const secondaryButton = `border-2 border-border bg-background text-foreground hover:bg-muted/50 transition-colors ${disabledState} ${focusRing}`;

export const dangerButton = `border-2 border-red-600 bg-red-600 text-white font-medium hover:border-red-700 hover:bg-red-700 transition-colors ${disabledState} ${focusRing}`;

const rowActionBase = `flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border text-foreground transition-colors ${disabledState} ${focusRing}`;

/** Small bordered action used in card headers and list rows. */
export const rowActionButton = `${rowActionBase} hover:border-foreground hover:bg-muted/50 disabled:hover:border-border disabled:hover:bg-transparent`;

export const rowDangerButton = `${rowActionBase} hover:border-red-700 hover:text-red-700 dark:hover:border-red-400 dark:hover:text-red-400`;
