import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { useTextInput } from "../../hooks/useTextInput";
import { THEME_COLORS } from "../../utils/constants";
import { verifyPassword } from "../../utils/passwordStorage";
import { InlineInput } from "../forms/InlineInput";
import { GuideBar } from "../shared/GuideBar";

interface PasswordUnlockPageProps {
  onUnlock: () => void;
}

/**
 * usePasswordInput inlined here since it's only used in this component.
 */
function usePasswordInput() {
  const textInput = useTextInput({ maxLength: 64 });
  const [showPassword, setShowPassword] = useState(false);

  return {
    ...textInput,
    showPassword,
    toggleVisibility: () => setShowPassword((prev) => !prev),
  };
}

export function PasswordUnlockPage({ onUnlock }: PasswordUnlockPageProps) {
  const { width, height } = useTerminalDimensions();
  const passwordInput = usePasswordInput();
  const [error, setError] = useState<string | null>(null);
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((prev) => !prev), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setError(null);
  }, []);

  const handleSubmit = async () => {
    if (passwordInput.value.length === 0) {
      setError("Password required");
      return;
    }

    if (!(await verifyPassword(passwordInput.value))) {
      setError("Incorrect password");
      return;
    }

    onUnlock();
  };

  useKeyboard((key) => {
    if (key.name === "v" && key.ctrl) {
      passwordInput.toggleVisibility();
      return;
    }
    if (key.name === "return") {
      handleSubmit();
      return;
    }
    if (key.name === "q") {
      process.exit(0);
    }
    if (key.sequence === " ") return;

    passwordInput.handleKey(key);
  });

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
            <text fg={THEME_COLORS.text}>Enter Password</text>
          </box>

          <box flexDirection="column" width={46} gap={1} marginTop={1}>
            <InlineInput
              value={passwordInput.value}
              cursor={passwordInput.cursor}
              cursorVisible={cursorVisible}
              maxWidth={28}
              maxLength={64}
              placeholder="Password"
              isFocused={true}
              isPassword={true}
              showPassword={passwordInput.showPassword}
              error={error}
              showIcon={false}
              showCount={false}
              width={46}
            />
          </box>

          <box marginTop={1}>
            <GuideBar
              groups={{
                primary: [
                  {
                    shortcuts: [
                      { key: "^v", description: passwordInput.showPassword ? "hide" : "show" },
                      { key: "↵", description: "unlock" },
                    ],
                  },
                ],
                secondary: [],
              }}
              customWidth={46}
              minimal={true}
            />
          </box>
        </box>
      </box>
    </box>
  );
}
