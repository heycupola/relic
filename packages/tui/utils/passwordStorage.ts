import { unlink } from "node:fs/promises";

const PASSWORD_FILE = `${Bun.env.HOME}/.relic_password`;

export async function hasPassword(): Promise<boolean> {
  return await Bun.file(PASSWORD_FILE).exists();
}

export async function savePassword(password: string): Promise<void> {
  await Bun.write(PASSWORD_FILE, password);
}

export async function verifyPassword(password: string): Promise<boolean> {
  if (!(await hasPassword())) return false;
  const stored = await Bun.file(PASSWORD_FILE).text();
  return stored === password;
}

export async function clearPassword(): Promise<void> {
  if (await hasPassword()) {
    try {
      await unlink(PASSWORD_FILE);
    } catch {
      // ignore
    }
  }
}
