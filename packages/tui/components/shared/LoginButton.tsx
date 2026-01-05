import { THEME_COLORS } from "../../utils/constants";

interface LoginButtonProps {
  label: string;
  selected: boolean;
}

export function LoginButton({ label, selected }: LoginButtonProps) {
  return (
    <box height={1} width={52}>
      <text>
        <span fg={selected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
          {selected ? "› " : "  "}
        </span>
        <span fg={selected ? THEME_COLORS.text : THEME_COLORS.textMuted}>{label}</span>
      </text>
    </box>
  );
}
