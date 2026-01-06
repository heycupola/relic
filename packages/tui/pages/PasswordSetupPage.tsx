import { useTerminalDimensions } from "@opentui/react";
import { PasswordForm } from "../components/forms/PasswordForm";
import { THEME_COLORS } from "../utils/constants";

interface PasswordSetupPageProps {
  onComplete: (password: string) => void;
}

export function PasswordSetupPage({ onComplete }: PasswordSetupPageProps) {
  const { width, height } = useTerminalDimensions();

  return (
    <box
      flexDirection="column"
      width={width}
      height={height}
      backgroundColor={THEME_COLORS.background}
    >
      <box
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        flexGrow={1}
        backgroundColor={THEME_COLORS.background}
      >
        <box
          flexDirection="column"
          backgroundColor={THEME_COLORS.header}
          width={50}
          paddingLeft={2}
          paddingRight={2}
          paddingBottom={1}
        >
          <box height={1} marginTop={1}>
            <text fg={THEME_COLORS.text}>Set Your Password</text>
          </box>

          <box height={1} marginTop={1}>
            <text>
              <span fg={THEME_COLORS.accent}>[!]</span>
              <span fg={THEME_COLORS.accent}> Your master password is never stored</span>
            </text>
          </box>

          <box flexDirection="column" width={46} marginTop={1}>
            <PasswordForm mode="setup" onSubmit={onComplete} width={46} />
          </box>
        </box>
      </box>
    </box>
  );
}
