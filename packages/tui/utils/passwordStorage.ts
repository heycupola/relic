import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PASSWORD_FILE = join(homedir(), ".relic_password");

export function hasPassword(): boolean {
  return existsSync(PASSWORD_FILE);
}

export function savePassword(password: string): void {
  writeFileSync(PASSWORD_FILE, password, "utf-8");
}

export function verifyPassword(password: string): boolean {
  if (!hasPassword()) return false;
  const stored = readFileSync(PASSWORD_FILE, "utf-8");
  return stored === password;
}

export function clearPassword(): void {
  if (hasPassword()) {
    unlinkSync(PASSWORD_FILE);
  }
}
