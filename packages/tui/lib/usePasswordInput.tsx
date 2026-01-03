import { useState } from "react";
import { useTextInput } from "./useTextInput";

export function usePasswordInput() {
    const textInput = useTextInput({ maxLength: 64 });
    const [showPassword, setShowPassword] = useState(false);

    return {
        ...textInput,
        showPassword,
        toggleVisibility: () => setShowPassword((prev) => !prev),
    };
}
