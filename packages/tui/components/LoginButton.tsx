import { THEME_COLORS } from "../lib/constants";

interface LoginButtonProps {
  label: string;
  selected: boolean;
}

export function LoginButton({ label, selected }: LoginButtonProps) {
  return (
    <box
      width={40}
      height={3}
      borderStyle={selected ? "double" : "single"}
      borderColor={selected ? THEME_COLORS.primary : THEME_COLORS.textMuted}
      backgroundColor={selected ? THEME_COLORS.inputBg : THEME_COLORS.header}
      justifyContent="center"
      alignItems="center"
    >
      <text fg={selected ? THEME_COLORS.primary : THEME_COLORS.textMuted}>
        {selected ? "› " : "  "}
        {label}
        {selected ? " ‹" : "  "}
      </text>
    </box>
  );
}
