export type SecretScope = "client" | "server" | "shared";

export interface RunTarget {
  environment: string;
  folder?: string;
  scope?: SecretScope;
}

export type ShellKind = "posix" | "powershell" | "cmd";

function targetFlags(target: RunTarget): string[] {
  const flags = ["-e", target.environment];
  if (target.folder) flags.push("-f", target.folder);
  if (target.scope) flags.push("-s", target.scope);
  return flags;
}

export function runArgs(target: RunTarget, command: string[]): string[] {
  return ["run", ...targetFlags(target), "--", ...command];
}

export function shellArgs(target: RunTarget): string[] {
  return ["shell", ...targetFlags(target)];
}

const SAFE_ARG = /^[\w@%+=:,./-]+$/;

export function quoteArg(arg: string, kind: ShellKind): string {
  if (arg === "--" && kind === "powershell") return "'--'";
  if (arg !== "" && SAFE_ARG.test(arg)) return arg;
  switch (kind) {
    case "posix":
      return `'${arg.replace(/'/g, `'\\''`)}'`;
    case "powershell":
      return `'${arg.replace(/'/g, "''")}'`;
    case "cmd":
      return `"${arg.replace(/"/g, '""')}"`;
  }
}

export function shellKindFor(platform: NodeJS.Platform, shellPath?: string): ShellKind {
  const shell = (shellPath ?? "").toLowerCase();
  if (/(^|[\\/])(pwsh|powershell)(\.exe)?$/.test(shell)) return "powershell";
  if (/(^|[\\/])cmd(\.exe)?$/.test(shell)) return "cmd";
  if (shell) return "posix";
  return platform === "win32" ? "powershell" : "posix";
}

/**
 * Builds a line to type into a shell. `command` is kept verbatim so the user's
 * own quoting, globs, and pipes keep working after the `--`.
 */
export function runCommandLine(
  cliPath: string,
  target: RunTarget,
  command: string,
  kind: ShellKind,
): string {
  const quotedCli = quoteArg(cliPath, kind);
  const invoke = kind === "powershell" && quotedCli !== cliPath ? `& ${quotedCli}` : quotedCli;
  const args = runArgs(target, []).map((arg) => quoteArg(arg, kind));
  return [invoke, ...args, command.trim()].join(" ");
}
