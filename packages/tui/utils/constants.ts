export const CHAR_LIMITS = {
  envName: 30,
  folderName: 30,
  secretKey: 100,
  secretValue: 1000,
  email: 100,
} as const;

export const INPUT_WIDTH = 38;

export const STATUS_COLORS: Record<string, string> & {
  owned: string;
  shared: string;
  archived: string;
  restricted: string;
} = {
  owned: "#9ece6a",
  shared: "#7aa2f7",
  archived: "#565f89",
  restricted: "#f7768e",
};

export const THEME_COLORS = {
  background: "#0f0f14",
  header: "#1a1b26",
  primary: "#7aa2f7",
  secondary: "#bb9af7",
  accent: "#e0af68",
  success: "#9ece6a",
  warning: "#e0af68",
  error: "#f7768e",
  text: "#c0caf5",
  textMuted: "#565f89",
  textDim: "#3b4261",
  inputBg: "#292e42",
  inputBgInactive: "#1f2335",
} as const;

export const KEY_SYMBOLS = {
  enter: "enter",
} as const;

export const PRICING = {
  seatPrice: "$5",
  projectPrice: "$10",
} as const;

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
export const SPINNER_INTERVAL = 80;

export const DASHBOARD_URL = `${process.env.SITE_URL ?? "http://localhost:3000"}/dashboard`;
