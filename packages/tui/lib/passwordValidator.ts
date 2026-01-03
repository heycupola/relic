/**
 * Password validation utilities for Relic TUI
 * Used for master password setup and changes
 */

export interface PasswordValidationResult {
    isValid: boolean;
    errors: string[];
    strength: "weak" | "medium" | "strong";
    strengthScore: number; // 0-5
}

export interface PasswordRequirement {
    id: string;
    label: string;
    met: boolean;
}

const MIN_PASSWORD_LENGTH = 8;

/**
 * Check individual password requirements
 */
export function checkPasswordRequirements(password: string): PasswordRequirement[] {
    return [
        {
            id: "length",
            label: `At least ${MIN_PASSWORD_LENGTH} characters`,
            met: password.length >= MIN_PASSWORD_LENGTH,
        },
        {
            id: "uppercase",
            label: "One uppercase letter",
            met: /[A-Z]/.test(password),
        },
        {
            id: "lowercase",
            label: "One lowercase letter",
            met: /[a-z]/.test(password),
        },
        {
            id: "number",
            label: "One number",
            met: /[0-9]/.test(password),
        },
        {
            id: "special",
            label: "One special character (!@#$%^&*...)",
            met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password),
        },
    ];
}

/**
 * Calculate password strength based on requirements met
 */
export function calculateStrength(requirements: PasswordRequirement[]): {
    strength: "weak" | "medium" | "strong";
    score: number;
} {
    const metCount = requirements.filter((r) => r.met).length;

    if (metCount <= 2) {
        return { strength: "weak", score: metCount };
    } else if (metCount <= 4) {
        return { strength: "medium", score: metCount };
    } else {
        return { strength: "strong", score: metCount };
    }
}

/**
 * Validate password and return detailed result
 */
export function validatePassword(password: string): PasswordValidationResult {
    const requirements = checkPasswordRequirements(password);
    const { strength, score } = calculateStrength(requirements);

    // Simplified validation - only check if password is not empty
    const isValid = password.length > 0;
    const errors = isValid ? [] : ["Password is required"];

    return {
        isValid,
        errors,
        strength,
        strengthScore: score,
    };
}

/**
 * Check if two passwords match
 */
export function passwordsMatch(password: string, confirmPassword: string): boolean {
    return password === confirmPassword && password.length > 0;
}

/**
 * Get strength indicator characters (●○ format)
 */
export function getStrengthIndicator(score: number): string {
    const filled = "●".repeat(score);
    const empty = "○".repeat(5 - score);
    return filled + empty;
}

/**
 * Get strength color based on strength level
 */
export function getStrengthColor(strength: "weak" | "medium" | "strong"): string {
    switch (strength) {
        case "weak":
            return "#f7768e"; // error red
        case "medium":
            return "#e0af68"; // accent yellow
        case "strong":
            return "#9ece6a"; // success green
    }
}
