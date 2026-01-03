import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { THEME_COLORS } from "../lib/constants";
import {
    checkPasswordRequirements,
    validatePassword,
    passwordsMatch,
    getStrengthColor,
    type PasswordRequirement,
} from "../lib/passwordValidator";
import { useTextInput } from "../lib/useTextInput";
import { usePaste } from "../lib/usePaste";
import { debugLog } from "../lib/debugLog";
import { InlineInput } from "./InlineInput";
import { GuideBar } from "./GuideBar";

interface PasswordFormProps {
    mode: "setup" | "change";
    onSubmit: (password: string) => void;
    onCancel?: () => void;
    currentPasswordRequired?: boolean;
    onCurrentPasswordVerify?: (password: string) => boolean;
    width?: number;
}

type FocusedField = "current" | "password" | "confirm";

export function PasswordForm({
    mode,
    onSubmit,
    onCancel,
    currentPasswordRequired = false,
    onCurrentPasswordVerify,
    width = 46,
}: PasswordFormProps) {
    const [focusedField, setFocusedField] = useState<FocusedField>(
        currentPasswordRequired ? "current" : "password"
    );
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
    const [cursorVisible, setCursorVisible] = useState(true);

    const currentInput = useTextInput({ maxLength: 64 });
    const passwordInput = useTextInput({ maxLength: 64 });
    const confirmInput = useTextInput({ maxLength: 64 });

    const requirements = checkPasswordRequirements(passwordInput.value);
    const validation = validatePassword(passwordInput.value);
    const doPasswordsMatch = passwordsMatch(passwordInput.value, confirmInput.value);

    useEffect(() => {
        const interval = setInterval(() => setCursorVisible((prev) => !prev), 530);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => setError(null), [passwordInput.value, confirmInput.value]);
    useEffect(() => setCurrentPasswordError(null), [currentInput.value]);

    // Paste handler
    const handlePaste = useCallback((text: string) => {
        const cleanText = text.replace(/\s/g, "");
        const activeInput = focusedField === "current" ? currentInput
            : focusedField === "password" ? passwordInput
                : confirmInput;

        const before = activeInput.value.slice(0, activeInput.cursor);
        const after = activeInput.value.slice(activeInput.cursor);
        const newValue = (before + cleanText + after).slice(0, 64);
        activeInput.setValue(newValue);
        activeInput.setCursor(Math.min(before.length + cleanText.length, 64));
    }, [focusedField, currentInput, passwordInput, confirmInput]);

    usePaste(handlePaste);

    const handleSubmit = () => {
        debugLog("handleSubmit called");
        // Calculate validation directly to avoid stale closure
        const currentValidation = validatePassword(passwordInput.value);
        const currentPasswordsMatch = passwordsMatch(passwordInput.value, confirmInput.value);

        debugLog("passwordInput.value:", passwordInput.value);
        debugLog("confirmInput.value:", confirmInput.value);
        debugLog("currentValidation:", currentValidation);
        debugLog("currentPasswordsMatch:", currentPasswordsMatch);

        if (currentPasswordRequired && onCurrentPasswordVerify) {
            if (!onCurrentPasswordVerify(currentInput.value)) {
                debugLog("Current password verification failed");
                setCurrentPasswordError("Incorrect");
                return;
            }
        }
        if (!currentValidation.isValid) {
            debugLog("Validation failed");
            setError("Does not meet requirements");
            return;
        }
        if (!currentPasswordsMatch) {
            debugLog("Passwords do not match");
            setError("Passwords do not match");
            return;
        }
        debugLog("Calling onSubmit");
        onSubmit(passwordInput.value);
    };

    const cycleFocus = (direction: "next" | "prev") => {
        const fields: FocusedField[] = currentPasswordRequired
            ? ["current", "password", "confirm"]
            : ["password", "confirm"];
        const currentIndex = fields.indexOf(focusedField);
        const nextIndex = direction === "next"
            ? (currentIndex + 1) % fields.length
            : (currentIndex - 1 + fields.length) % fields.length;
        setFocusedField(fields[nextIndex]!);
    };

    useKeyboard((key) => {
        debugLog("Key pressed:", key.name, key);
        if (key.name === "v" && key.ctrl) {
            setShowPassword((prev) => !prev);
            return;
        }
        if (key.name === "escape" && onCancel) {
            onCancel();
            return;
        }
        if (key.name === "tab") {
            cycleFocus(key.shift ? "prev" : "next");
            return;
        }
        if (key.name === "return") {
            debugLog("Return key detected, calling handleSubmit");
            handleSubmit();
            return;
        }
        if (key.sequence === " ") return;

        const activeInput = focusedField === "current" ? currentInput
            : focusedField === "password" ? passwordInput
                : confirmInput;
        activeInput.handleKey(key);
    });

    // Show hint only when password field is focused
    const showHint = focusedField === "password";

    return (
        <box flexDirection="column" width={width} gap={1}>
            {/* Current password - inline style */}
            {currentPasswordRequired && (
                <InlineInput
                    value={currentInput.value}
                    cursor={currentInput.cursor}
                    cursorVisible={cursorVisible}
                    maxWidth={28}
                    maxLength={64}
                    placeholder="Current password"
                    isFocused={focusedField === "current"}
                    isPassword={true}
                    showPassword={showPassword}
                    error={currentPasswordError}
                    showIcon={false}
                    showCount={false}
                    width={width}
                />
            )}

            {/* New password - inline style */}
            <InlineInput
                value={passwordInput.value}
                cursor={passwordInput.cursor}
                cursorVisible={cursorVisible}
                maxWidth={28}
                maxLength={64}
                placeholder={mode === "setup" ? "Password" : "New password"}
                isFocused={focusedField === "password"}
                isPassword={true}
                showPassword={showPassword}
                showIcon={false}
                showCount={false}
                width={width}
            />

            {/* Requirements hint box - only shows when password focused */}
            {showHint && (
                <box
                    flexDirection="column"
                    backgroundColor={THEME_COLORS.header}
                    width={width}
                    paddingLeft={1}
                    paddingRight={1}
                >
                    {/* Strength bar */}
                    <box height={1}>
                        <text>
                            <span fg={getStrengthColor(validation.strength)}>
                                {"●".repeat(validation.strengthScore)}{"○".repeat(5 - validation.strengthScore)}
                            </span>
                            <span fg={THEME_COLORS.textMuted}> </span>
                            <span fg={getStrengthColor(validation.strength)}>{validation.strength}</span>
                        </text>
                    </box>
                    {/* Requirements list */}
                    {requirements.map((req: PasswordRequirement) => (
                        <box key={req.id} height={1}>
                            <text>
                                <span fg={req.met ? THEME_COLORS.success : THEME_COLORS.textMuted}>
                                    {req.met ? "✓" : "○"}
                                </span>
                                <span fg={req.met ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                                    {" "}{req.label}
                                </span>
                            </text>
                        </box>
                    ))}
                </box>
            )}

            {/* Confirm password - inline style */}
            <InlineInput
                value={confirmInput.value}
                cursor={confirmInput.cursor}
                cursorVisible={cursorVisible}
                maxWidth={28}
                maxLength={64}
                placeholder="Confirm password"
                isFocused={focusedField === "confirm"}
                isPassword={true}
                showPassword={showPassword}
                error={confirmInput.value.length > 0 && !doPasswordsMatch ? "mismatch" : null}
                showIcon={false}
                showCount={false}
                width={width}
            />

            {/* Error */}
            {error && (
                <box height={1} marginTop={1} paddingLeft={1}>
                    <text fg={THEME_COLORS.error}>[!] {error}</text>
                </box>
            )}

            {/* Shortcuts */}
            <box>
                <GuideBar
                    groups={{
                        primary: [
                            {
                                shortcuts: [
                                    { key: "^v", description: showPassword ? "hide" : "show" },
                                    { key: "tab", description: "next field" },
                                    { key: "↵", description: mode === "setup" ? "continue" : "save" },
                                ],
                            },
                        ],
                        secondary: [],
                    }}
                    customWidth={width}
                    minimal={true}
                />
            </box>
        </box>
    );
}
