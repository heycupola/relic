export const CHAR_LIMITS = {
  envName: 30,
  folderName: 30,
  secretKey: 100,
  secretValue: 1000,
  email: 100,
} as const;

export const INPUT_WIDTH = 38;

export const COLLABORATOR_LIMIT = 5;

export const STATUS_COLORS = {
  owned: "#9ece6a",
  shared: "#7aa2f7",
  archived: "#565f89",
} as const;

export const THEME_COLORS = {
  background: "#0f0f14",
  header: "#1a1b26",
  primary: "#7aa2f7",
  secondary: "#bb9af7",
  accent: "#e0af68",
  success: "#9ece6a",
  error: "#f7768e",
  text: "#c0caf5",
  textMuted: "#565f89",
  textDim: "#3b4261",
  inputBg: "#292e42",
  inputBgInactive: "#1f2335",
} as const;
