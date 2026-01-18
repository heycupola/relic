import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { InlineInput } from "../components/forms/InlineInput";
import { GuideBar } from "../components/shared/GuideBar";
import { Modal } from "../components/shared/Modal";
import { KEY_SYMBOLS, THEME_COLORS } from "../utils/constants";
import { verifyPassword } from "../utils/password";

interface PasswordUnlockPageProps {
  onUnlock: () => void;
  onLogout: () => Promise<void>;
}

export function PasswordUnlockPage({ onUnlock, onLogout }: PasswordUnlockPageProps) {
  const { width, height } = useTerminalDimensions();
  const [error, setError] = useState<string | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (password: string) => {
    setIsLoading(true);
    try {
      if (!(await verifyPassword(password))) {
        setError("Incorrect password");
        return;
      }
      onUnlock();
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await onLogout();
  };

  useKeyboard((key) => {
    if (isLoading) return;

    if (showLogoutModal) {
      if (key.name === "y") {
        handleLogout();
        return;
      } else if (key.name === "n" || key.name === "escape") {
        setShowLogoutModal(false);
        return;
      }
    }

    if ((key.name === "l" && key.ctrl) || key.sequence === "\x0C") {
      setShowLogoutModal(true);
      return;
    }
    if (key.name === "q") {
      process.exit(0);
    }
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
              active={true}
              maxWidth={28}
              maxLength={64}
              placeholder="Password"
              isFocused={true}
              isPassword={true}
              showPassword={false}
              error={error}
              showIcon={false}
              showCount={false}
              width={46}
              onSubmit={handleSubmit}
            />
          </box>

          <box marginTop={1}>
            <GuideBar
              groups={{
                primary: [
                  {
                    shortcuts: [
                      { key: KEY_SYMBOLS.enter, description: "unlock", disabled: isLoading },
                      { key: "^l", description: "logout", disabled: isLoading },
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

      <Modal
        visible={showLogoutModal}
        title="Logout"
        width={45}
        height={8}
        shortcuts={[
          { key: "y", description: "yes", disabled: isLoading },
          { key: "n", description: "no", disabled: isLoading },
        ]}
      >
        <text fg={THEME_COLORS.textDim}>Are you sure you want to logout?</text>
      </Modal>
    </box>
  );
}
