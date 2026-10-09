import { SITE_URL } from "@repo/auth";

export const CHAR_LIMITS = {
  envName: 30,
  folderName: 30,
  secretKey: 100,
  secretValue: 1000,
  email: 100,
} as const;

export const INPUT_WIDTH = 38;

// NOTE: textMuted is brighter than textDim. Use textMuted for anything the user needs to read
// (URLs, counts, hints) and textDim only for decoration (brackets, separators, placeholders).
export const THEME_COLORS = {
  background: "#0f0f14",
  header: "#1a1b26",
  statusBar: "#1a1e2e",
  statusBarActive: "#24283b",
  textInverse: "#1a1e2e",
  primary: "#7aa2f7",
  secondary: "#bb9af7",
  accent: "#ff9e64",
  link: "#7dcfff",
  success: "#9ece6a",
  warning: "#e0af68",
  error: "#f7768e",
  text: "#c0caf5",
  textMuted: "#565f89",
  textDim: "#3b4261",
  inputBg: "#292e42",
  inputBgInactive: "#1f2335",
} as const;

export const STATUS_COLORS: Record<string, string> & {
  owned: string;
  shared: string;
  archived: string;
  restricted: string;
} = {
  owned: THEME_COLORS.success,
  shared: THEME_COLORS.primary,
  archived: THEME_COLORS.textMuted,
  restricted: THEME_COLORS.error,
};

export const STATUS_ICONS: Record<string, string> & {
  owned: string;
  shared: string;
  archived: string;
  restricted: string;
} = {
  owned: "●",
  shared: "◉",
  archived: "○",
  restricted: "Ø",
};

export const KEY_SYMBOLS = {
  enter: "enter",
} as const;

export const PRICING = {
  collaboratorPrice: "$1/month",
  projectPrice: "$2/month",
} as const;

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
export const SPINNER_INTERVAL = 80;

export const DASHBOARD_URL = `${SITE_URL}/dashboard`;
