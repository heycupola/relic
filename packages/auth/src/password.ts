import { resolve } from "node:path";
import { decryptPrivateKeyWithPassword } from "@repo/crypto";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const CONFIG_DIR =
  process.platform === "win32"
    ? resolve(HOME, "AppData", "Roaming", "relic")
    : resolve(HOME, ".config", "relic");
const PASSWORD_FILE = resolve(CONFIG_DIR, "password");

const SECRETS_SERVICE = "com.relic.tui";
const SECRETS_NAME = "master-password";

const ENV_PASSWORD_KEY = "RELIC_PASSWORD";

async function ensureConfigDir(): Promise<void> {
  const { mkdir, chmod } = await import("node:fs/promises");
  try {
    await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      await chmod(CONFIG_DIR, 0o700);
    }
  } catch (_) {
    void 0;
  }
}

export function isPasswordFromEnv(): boolean {
  const envPassword = process.env[ENV_PASSWORD_KEY];
  return !!envPassword && envPassword.length > 0;
}

export async function getPasswordFromStorage(): Promise<string | null> {
  const envPassword = process.env[ENV_PASSWORD_KEY];
  if (envPassword && envPassword.length > 0) {
    return envPassword;
  }

  const { secrets } = await import("bun");
  try {
    const password = await secrets.get({ service: SECRETS_SERVICE, name: SECRETS_NAME });
    if (password !== null && password.length > 0) return password;
  } catch (_) {
    void 0;
  }

  try {
    const file = Bun.file(PASSWORD_FILE);
    if (await file.exists()) {
      const password = await file.text();
      return password.length > 0 ? password : null;
    }
  } catch (_) {
    void 0;
  }

  return null;
}

async function savePasswordToStorage(password: string): Promise<void> {
  const { secrets } = await import("bun");
  const { unlink } = await import("node:fs/promises");

  try {
    await secrets.set({ service: SECRETS_SERVICE, name: SECRETS_NAME, value: password });
    try {
      const file = Bun.file(PASSWORD_FILE);
      if (await file.exists()) await unlink(PASSWORD_FILE);
    } catch (_) {
      void 0;
    }
    return;
  } catch (_) {
    void 0;
  }

  try {
    await ensureConfigDir();
    await Bun.write(PASSWORD_FILE, password);
  } catch (error) {
    throw new Error(`Failed to save password: ${error}`);
  }
}

async function deletePasswordFromStorage(): Promise<void> {
  const { secrets } = await import("bun");
  const { unlink } = await import("node:fs/promises");

  try {
    await secrets.delete({ service: SECRETS_SERVICE, name: SECRETS_NAME });
  } catch (_) {
    void 0;
  }

  try {
    const file = Bun.file(PASSWORD_FILE);
    if (await file.exists()) await unlink(PASSWORD_FILE);
  } catch (_) {
    void 0;
  }
}

export async function hasPassword(): Promise<boolean> {
  const password = await getPasswordFromStorage();
  return password !== null && password.length > 0;
}

export async function savePassword(password: string): Promise<void> {
  await savePasswordToStorage(password);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = await getPasswordFromStorage();
  return stored !== null && stored === password;
}

export async function clearPassword(): Promise<void> {
  await deletePasswordFromStorage();
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: "weak" | "medium" | "strong";
  strengthScore: number;
}

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

const MIN_PASSWORD_LENGTH = 8;

export function checkPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      id: "length",
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    { id: "uppercase", label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { id: "lowercase", label: "One lowercase letter", met: /[a-z]/.test(password) },
    { id: "number", label: "One number", met: /[0-9]/.test(password) },
    {
      id: "special",
      label: "One special character (!@#$%^&*...)",
      met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password),
    },
  ];
}

function calculateStrength(requirements: PasswordRequirement[]): {
  strength: "weak" | "medium" | "strong";
  score: number;
} {
  const metCount = requirements.filter((r) => r.met).length;
  if (metCount <= 2) return { strength: "weak", score: metCount };
  if (metCount <= 4) return { strength: "medium", score: metCount };
  return { strength: "strong", score: metCount };
}

export function validatePassword(password: string): PasswordValidationResult {
  const requirements = checkPasswordRequirements(password);
  const { strength, score } = calculateStrength(requirements);

  if (password.length === 0) {
    return { isValid: false, errors: ["Password is required"], strength, strengthScore: score };
  }

  const unmetRequirements = requirements.filter((r) => !r.met);
  const isValid = unmetRequirements.length === 0;
  const errors = unmetRequirements.map((r) => r.label);

  return { isValid, errors, strength, strengthScore: score };
}

export function getStrengthColor(strength: "weak" | "medium" | "strong"): string {
  switch (strength) {
    case "weak":
      return "#f7768e";
    case "medium":
      return "#e0af68";
    case "strong":
      return "#9ece6a";
  }
}

export async function verifyPasswordWithExistingKeys(
  newPassword: string,
  encryptedPrivateKey: string,
  salt: string,
): Promise<boolean> {
  try {
    await decryptPrivateKeyWithPassword(encryptedPrivateKey, newPassword, salt);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("DECRYPTION_FAILED")) {
      return false;
    }
    return false;
  }
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getPasswordFilePath(): string {
  return PASSWORD_FILE;
}
