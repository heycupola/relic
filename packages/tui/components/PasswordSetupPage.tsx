import { useTerminalDimensions } from "@opentui/react";
import { THEME_COLORS } from "../lib/constants";
import { PasswordForm } from "./PasswordForm";

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
                    {/* Heading */}
                    <box height={1} marginTop={1}>
                        <text fg={THEME_COLORS.text}>Set Your Password</text>
                    </box>

                    {/* Warning message */}
                    <box height={1} marginTop={1}>
                        <text>
                            <span fg={THEME_COLORS.accent}>[!]</span>
                            <span fg={THEME_COLORS.accent}> Your master password is never stored</span>
                        </text>
                    </box>

                    {/* Password form */}
                    <box flexDirection="column" width={46} marginTop={1}>
                        <PasswordForm mode="setup" onSubmit={onComplete} width={46} />
                    </box>
                </box>
            </box>
        </box>
    );
}
