import { THEME_COLORS } from "../../utils/constants";

interface LoginButtonProps {
  label: string;
}

export function LoginButton({ label }: LoginButtonProps) {
  return (
    <box height={1} width={52}>
      <text>
        <span fg={THEME_COLORS.primary}>{"› "}</span>
        <span fg={THEME_COLORS.text}>{label}</span>
      </text>
    </box>
  );
}
