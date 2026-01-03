/**
 * Basic password storage and verification
 * Uses file-based storage for CLI/TUI environment
 * TODO: Replace with proper crypto implementation later
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Store password file in user's home directory
const PASSWORD_FILE = join(homedir(), ".relic_password");

/**
 * Check if user has a saved password
 */
export function hasPassword(): boolean {
    return existsSync(PASSWORD_FILE);
}

/**
 * Save password to file
 */
export function savePassword(password: string): void {
    writeFileSync(PASSWORD_FILE, password, "utf-8");
}

/**
 * Verify password against stored value
 */
export function verifyPassword(password: string): boolean {
    if (!hasPassword()) return false;
    const stored = readFileSync(PASSWORD_FILE, "utf-8");
    return stored === password;
}

/**
 * Clear saved password
 */
export function clearPassword(): void {
    if (hasPassword()) {
        unlinkSync(PASSWORD_FILE);
    }
}
