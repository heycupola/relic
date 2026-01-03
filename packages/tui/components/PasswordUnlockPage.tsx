import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { THEME_COLORS } from "../lib/constants";
import { usePasswordInput } from "../lib/usePasswordInput";
import { verifyPassword } from "../lib/passwordStorage";
import { InlineInput } from "./InlineInput";
import { GuideBar } from "./GuideBar";

interface PasswordUnlockPageProps {
    onUnlock: () => void;
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
    }, [passwordInput.value]);

    const handleSubmit = () => {
        if (passwordInput.value.length === 0) {
            setError("Password required");
            return;
        }

        // Verify password using simple string comparison
        if (!verifyPassword(passwordInput.value)) {
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
                    {/* Heading */}
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
