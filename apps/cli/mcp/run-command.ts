export const MIN_REDACT_LENGTH = 4;
export const MAX_OUTPUT_CHARS = 50_000;
export const DEFAULT_TIMEOUT_SECONDS = 120;
export const MAX_TIMEOUT_SECONDS = 600;
const KILL_GRACE_MS = 2_000;
const STREAM_DRAIN_MS = 1_000;
const IS_POSIX = process.platform !== "win32";

const SHELL_PROGRAMS = new Set([
  "sh",
  "bash",
  "zsh",
  "dash",
  "ksh",
  "fish",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
]);

/** argv[0] helpers that commonly wrap `env` / `printenv` / a shell. */
const PROCESS_WRAPPERS = new Set([
  "nice",
  "nice.exe",
  "stdbuf",
  "stdbuf.exe",
  "busybox",
  "busybox.exe",
]);

/**
 * Optional prefixes before a dump word inside a shell script:
 * - `exec` / `command` / `builtin` with short flags or `--`
 * - `nice` / `stdbuf` / `busybox` with short options / numeric args
 * False-positives like `command -v env` are accepted — opt-in still unlocks them.
 */
const DUMP_PREFIX = String.raw`(?:(?:(?:exec|command|builtin)(?:\s+-\w+|\s+--)*|(?:nice|stdbuf|busybox)(?:\s+(?:-\S+|\d+))*)\s+)*`;

/**
 * Optional path to `env`/`printenv`: absolute (`/usr/local/bin/env`),
 * relative (`./env`, `../usr/bin/env`), or bare basename.
 */
const ENV_PATH_PREFIX = String.raw`(?:(?:(?:\.\.?\/)+|\/)(?:[^\/\s;|&]+\/)*)?`;

/** Absolute, relative, or bare `env`. */
const ENV_PROG = String.raw`${ENV_PATH_PREFIX}env\b`;

/** Absolute, relative, or bare `printenv`. */
const PRINTENV_PROG = String.raw`${ENV_PATH_PREFIX}printenv\b`;

/** Statement boundary before a dump command. */
const STMT_START = String.raw`(?:^|[;&\n|]|&&|\|\|)\s*`;

/** Bare `set` with no options/assignments — dumps the shell environment. */
const SHELL_BARE_SET_RE = new RegExp(`${STMT_START}${DUMP_PREFIX}set\\s*(?:[;&\\n|]|$)`);

const POWERSHELL_ENV_DUMP_RE =
  /(?:Get-ChildItem|gci|dir|ls)\s+(?:-Path\s+|Path\s*=\s*)?Env:|\[System\.Environment\]::GetEnvironmentVariables/i;

const POWERSHELL_ENCODED_FLAGS = new Set(["-encodedcommand", "-enc", "-ec"]);

/** Language runtimes that commonly eval one-liners dumping the process environment. */
const JS_RUNTIME_PROGRAMS = new Set([
  "node",
  "nodejs",
  "node.exe",
  "nodejs.exe",
  "bun",
  "bun.exe",
  "deno",
  "deno.exe",
]);

const PYTHON_PROGRAMS = new Set(["python", "python3", "python.exe", "python3.exe", "py", "py.exe"]);

const RUBY_PROGRAMS = new Set(["ruby", "ruby.exe"]);
const PERL_PROGRAMS = new Set(["perl", "perl.exe"]);

/** Human/server config opt-in for common env dumps (never a model-settable tool arg). */
export const RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP = "RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP";

interface RedactionEntry {
  key: string;
  value: string;
}

export class EnvDumpBlockedError extends Error {
  readonly pattern: string;

  constructor(pattern: string) {
    super(
      `Refusing env-dump command (${pattern}). Common dumps (env, printenv, bare set, PowerShell Env:, ` +
        "interpreter environ/`process.env` one-liners) can leak secret values that best-effort " +
        "redaction cannot fully scrub. Operators may opt in only by setting " +
        `${RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP}=true on the Relic MCP server process.`,
    );
    this.name = "EnvDumpBlockedError";
    this.pattern = pattern;
  }
}

/** Fail-secure: unset/false/empty refuse; only explicit truthy tokens allow dumps. */
export function isDangerousEnvDumpAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP];
  if (raw === undefined) return false;
  const value = raw.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function isPhpProgram(prog: string): boolean {
  return /^php(\d+(\.\d+)*)?(\.exe)?$/.test(prog);
}

function isInlineEvalInterpreter(prog: string): boolean {
  return (
    JS_RUNTIME_PROGRAMS.has(prog) ||
    PYTHON_PROGRAMS.has(prog) ||
    RUBY_PROGRAMS.has(prog) ||
    PERL_PROGRAMS.has(prog) ||
    isPhpProgram(prog)
  );
}

function programBasename(arg: string): string {
  const base = arg.split(/[/\\]/).pop() ?? arg;
  return base.toLowerCase();
}

/** True when `env` argv still has a command after options and NAME=value assignments. */
function envArgvHasCommand(args: string[]): boolean {
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg === "--") {
      i += 1;
      break;
    }
    if (arg.startsWith("-")) {
      // `env -u NAME` / `env --unset=NAME` consume a following operand when needed.
      if (
        (arg === "-u" || arg === "--unset") &&
        i + 1 < args.length &&
        !args[i + 1]!.startsWith("-")
      ) {
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (/^[A-Za-z_][\w]*=/.test(arg)) {
      i += 1;
      continue;
    }
    return true;
  }
  return i < args.length;
}

function extractShellScript(command: string[]): string | null {
  for (let i = 1; i < command.length; i++) {
    const flag = command[i]!.toLowerCase();
    if (
      flag === "-c" ||
      flag === "/c" ||
      flag === "-command" ||
      flag === "-encodedcommand" ||
      flag === "--%"
    ) {
      return command.slice(i + 1).join(" ");
    }
  }
  return null;
}

/** True when PowerShell is given an opaque `-EncodedCommand` (or short form). */
function hasPowerShellEncodedCommand(command: string[]): boolean {
  const prog = programBasename(command[0]!);
  if (
    prog !== "powershell" &&
    prog !== "powershell.exe" &&
    prog !== "pwsh" &&
    prog !== "pwsh.exe"
  ) {
    return false;
  }
  for (let i = 1; i < command.length; i++) {
    const flag = command[i]!.toLowerCase();
    if (POWERSHELL_ENCODED_FLAGS.has(flag)) return true;
    for (const prefix of POWERSHELL_ENCODED_FLAGS) {
      if (flag.startsWith(`${prefix}:`)) return true;
    }
  }
  return false;
}

/**
 * Strip a single `nice` / `stdbuf` / `busybox` wrapper so the remaining argv can be re-checked.
 * Returns null when this argv[0] is not a known wrapper or nothing remains after options.
 */
function unwrapProcessWrapper(command: string[]): string[] | null {
  if (command.length < 2) return null;
  const prog = programBasename(command[0]!);
  if (!PROCESS_WRAPPERS.has(prog)) return null;

  let i = 1;
  if (prog === "busybox" || prog === "busybox.exe") {
    while (i < command.length && command[i]!.startsWith("-")) i += 1;
    return i < command.length ? command.slice(i) : null;
  }

  if (prog === "nice" || prog === "nice.exe") {
    while (i < command.length) {
      const arg = command[i]!;
      if (arg === "-n" || arg === "--adjustment") {
        i += 2;
        continue;
      }
      if (arg.startsWith("-")) {
        i += 1;
        continue;
      }
      break;
    }
    return i < command.length ? command.slice(i) : null;
  }

  // stdbuf: -i/-o/-e take a following operand unless written as -oL.
  while (i < command.length) {
    const arg = command[i]!;
    if (arg === "-i" || arg === "-o" || arg === "-e") {
      i += 2;
      continue;
    }
    if (arg.startsWith("--input=") || arg.startsWith("--output=") || arg.startsWith("--error=")) {
      i += 1;
      continue;
    }
    if (arg === "--input" || arg === "--output" || arg === "--error") {
      i += 2;
      continue;
    }
    if (/^-[ioe]./.test(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      i += 1;
      continue;
    }
    break;
  }
  return i < command.length ? command.slice(i) : null;
}

/**
 * High-signal language-runtime environ dumps only (Economy of Mechanism).
 * Does not attempt full coverage of arbitrary code that reads env.
 */
function detectInterpreterEnvDumpScript(script: string): string | null {
  const trimmed = script.trim();
  // Whole-env object only — keyed reads like process.env.FOO / os.environ.get are allowed.
  const jsEnvWhole = String.raw`(?:process|Bun)\.env(?![\w.$\[])`;

  if (
    new RegExp(`^${jsEnvWhole}\\s*;?$`).test(trimmed) ||
    new RegExp(`^JSON\\.stringify\\(\\s*${jsEnvWhole}\\s*\\)\\s*;?$`).test(trimmed) ||
    new RegExp(
      `(?:console\\.(?:log|dir|info|debug|error|table|write)|util\\.inspect|JSON\\.stringify)\\s*\\(\\s*${jsEnvWhole}`,
    ).test(script) ||
    new RegExp(`Object\\.(?:entries|values)\\s*\\(\\s*${jsEnvWhole}`).test(script) ||
    /\bDeno\.env\.toObject\s*\(/.test(script)
  ) {
    return "interpreter process.env";
  }

  if (
    /\b(?:print|pprint|pp)\s*\(\s*(?:dict\s*\(\s*)?os\.environ(?![\w.$[])/.test(script) ||
    /\bjson\.dumps\s*\(\s*(?:dict\s*\(\s*)?os\.environ(?![\w.$[])/.test(script) ||
    /\bos\.environ\.(?:items|values)\s*\(/.test(script)
  ) {
    return "interpreter os.environ";
  }

  if (
    /\b(?:p|pp|puts|print|warn)\s+ENV\b/.test(script) ||
    /\bENV\.(?:to_h|to_hash|inspect)\b/.test(script)
  ) {
    return "interpreter ENV";
  }

  if (/\b(?:print|say)\b[^;\n]*%ENV\b/.test(script) || /\bDumper\s*\(\s*\\?%ENV\b/.test(script)) {
    return "interpreter %ENV";
  }

  if (/\b(?:print_r|var_dump|var_export|json_encode)\s*\(\s*\$_(?:ENV|SERVER)\b/.test(script)) {
    return "interpreter $_ENV";
  }

  return null;
}

/** Extract `-e` / `-c` / `--eval` / `deno eval` style inline scripts from interpreter argv. */
function extractInlineEvalScript(command: string[]): string | null {
  for (let i = 1; i < command.length; i++) {
    const arg = command[i]!;
    const lower = arg.toLowerCase();

    for (const prefix of ["--eval=", "--print="]) {
      if (lower.startsWith(prefix)) return arg.slice(prefix.length);
    }

    if (
      lower === "-e" ||
      lower === "--eval" ||
      lower === "-p" ||
      lower === "--print" ||
      lower === "-c" ||
      lower === "-r" ||
      lower === "-E"
    ) {
      return command[i + 1] ?? null;
    }

    // `deno eval "code"` — subcommand form, not a flag.
    if (i === 1 && lower === "eval") {
      const body = command
        .slice(i + 1)
        .join(" ")
        .trim();
      return body.length > 0 ? body : null;
    }
  }
  return null;
}

function detectShellEnvDump(script: string): string | null {
  if (POWERSHELL_ENV_DUMP_RE.test(script)) return "PowerShell Env:";
  if (SHELL_BARE_SET_RE.test(script)) return "set";
  if (new RegExp(`${STMT_START}${DUMP_PREFIX}${PRINTENV_PROG}`).test(script)) {
    return "printenv";
  }
  if (/\bexport\s+-p\b/.test(script)) return "export -p";
  if (/\bdeclare\s+-[A-Za-z]*[px][A-Za-z]*\b/.test(script)) return "declare";
  if (/\btypeset\s+-[A-Za-z]*x[A-Za-z]*\b/.test(script)) return "typeset -x";
  if (/\bcompgen\s+-e\b/.test(script)) return "compgen -e";
  if (/\/(?:[^/\s;|&]+\/)+environ\b/.test(script)) return "/proc/*/environ";

  // Prefer a conservative `env` match: bare `env` / `env -0` style, not `env FOO=bar cmd`.
  const bareEnv = new RegExp(`${STMT_START}${DUMP_PREFIX}${ENV_PROG}\\s*(?:[;&\\n|]|$)`);
  if (bareEnv.test(script)) return "env";

  const envWithFlags = new RegExp(`${STMT_START}${DUMP_PREFIX}${ENV_PROG}\\s+-[a-zA-Z0-9]*[0u]`);
  if (envWithFlags.test(script)) {
    // `env -0` / `env -u` without a following command still dumps or is dump-adjacent; block
    // when there is no clear trailing command word after options/assignments.
    const after = script.replace(/^[\s\S]*?\benv\b/, "env");
    const tokens = after.trim().split(/\s+/);
    if (!envArgvHasCommand(tokens.slice(1))) return "env";
  }

  const interpreterHit = detectInterpreterEnvDumpScript(script);
  if (interpreterHit) return interpreterHit;

  return null;
}

/**
 * Returns a human-readable dump pattern when `command` looks like a common environment dump.
 * Returns null for normal commands (including `env FOO=bar cmd`).
 */
export function detectEnvDumpCommand(command: string[]): string | null {
  if (command.length === 0) return null;

  const unwrapped = unwrapProcessWrapper(command);
  if (unwrapped) return detectEnvDumpCommand(unwrapped);

  const prog = programBasename(command[0]!);

  if (prog === "printenv" || prog === "printenv.exe") return "printenv";

  if (prog === "env" || prog === "env.exe") {
    return envArgvHasCommand(command.slice(1)) ? null : "env";
  }

  if ((prog === "set" || prog === "set.exe") && command.length === 1) return "set";

  // Opaque encoded scripts bypass plaintext dump heuristics — require opt-in.
  if (hasPowerShellEncodedCommand(command)) return "PowerShell -EncodedCommand";

  if (SHELL_PROGRAMS.has(prog)) {
    const script = extractShellScript(command);
    if (script) {
      const hit = detectShellEnvDump(script);
      if (hit) return hit;
    }
  }

  if (isInlineEvalInterpreter(prog)) {
    const script = extractInlineEvalScript(command);
    if (script) {
      const hit = detectInterpreterEnvDumpScript(script);
      if (hit) return hit;
    }
  }

  return null;
}

/**
 * Throws {@link EnvDumpBlockedError} unless the MCP server process opts in via
 * {@link RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP}. Pass `env` in tests; production uses `process.env`.
 */
export function assertEnvDumpAllowed(
  command: string[],
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): void {
  const pattern = detectEnvDumpCommand(command);
  if (pattern && !isDangerousEnvDumpAllowed(env)) {
    throw new EnvDumpBlockedError(pattern);
  }
}

/** Longest values first so a secret that contains another is replaced as a whole. */
function redactionEntries(secrets: Record<string, string>): RedactionEntry[] {
  const seen = new Set<string>();
  const entries: RedactionEntry[] = [];
  for (const [key, value] of Object.entries(secrets)) {
    if (value.length < MIN_REDACT_LENGTH || seen.has(value)) continue;
    seen.add(value);
    entries.push({ key, value });
  }
  return entries.sort((a, b) => b.value.length - a.value.length);
}

/** Best-effort: only verbatim occurrences are caught, not encoded or transformed values. */
export function redactSecrets(text: string, secrets: Record<string, string>): string {
  let result = text;
  for (const { key, value } of redactionEntries(secrets)) {
    if (result.includes(value)) {
      result = result.split(value).join(`[REDACTED:${key}]`);
    }
  }
  return result;
}

/** Drops a trailing partial secret left behind when output was cut off mid-value. */
function stripTrailingSecretPrefix(text: string, secrets: Record<string, string>): string {
  let longest = 0;
  for (const { value } of redactionEntries(secrets)) {
    for (let length = Math.min(value.length - 1, text.length); length > longest; length--) {
      if (text.endsWith(value.slice(0, length))) {
        longest = length;
        break;
      }
    }
  }
  return longest > 0 ? text.slice(0, text.length - longest) : text;
}

interface CapturedStream {
  text: string;
  truncated: boolean;
}

async function captureStream(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  registerCancel: (cancel: () => void) => void,
): Promise<CapturedStream> {
  const reader = stream.getReader();
  registerCancel(() => {
    reader.cancel().catch(() => undefined);
  });
  const decoder = new TextDecoder();
  let text = "";
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (text.length >= limit) {
        truncated = true;
        continue;
      }
      text += decoder.decode(value, { stream: true });
      if (text.length > limit) {
        text = text.slice(0, limit);
        truncated = true;
      }
    }
    if (!truncated) text += decoder.decode();
  } catch {
    // stream cancelled after a timeout; keep what was captured
  }

  return { text, truncated };
}

export interface RunCapturedOptions {
  command: string[];
  env: Record<string, string>;
  secrets: Record<string, string>;
  timeoutMs: number;
  maxOutputChars?: number;
  cwd?: string;
}

export interface RunCapturedResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

function finalizeOutput(
  captured: CapturedStream,
  secrets: Record<string, string>,
  maxChars: number,
): { text: string; truncated: boolean } {
  let text = redactSecrets(captured.text, secrets);
  let truncated = captured.truncated;
  if (truncated) {
    text = stripTrailingSecretPrefix(text, secrets);
  }
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }
  text = text.trimEnd();
  return { text: truncated ? `${text}\n... (truncated)` : text, truncated };
}

/**
 * Runs a command with a hard timeout, capturing at most `maxOutputChars` per stream while
 * draining the rest (so the child never blocks on a full pipe), and redacts secret values.
 */
export async function runCommandCaptured(options: RunCapturedOptions): Promise<RunCapturedResult> {
  const maxChars = options.maxOutputChars ?? MAX_OUTPUT_CHARS;
  const longestSecret = Math.max(0, ...Object.values(options.secrets).map((v) => v.length));
  // Capture a little extra so a secret straddling the limit is still redacted as a whole.
  const captureLimit = maxChars + longestSecret;

  // A separate process group lets a timeout kill the whole tree (e.g. `sh -c "sleep 30"`).
  const proc = Bun.spawn(options.command, {
    env: options.env,
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    detached: IS_POSIX,
  });

  const killTree = (signal: NodeJS.Signals) => {
    try {
      if (IS_POSIX) process.kill(-proc.pid, signal);
      else proc.kill(signal);
    } catch {
      // already exited
    }
  };

  const cancels: Array<() => void> = [];
  const registerCancel = (cancel: () => void) => cancels.push(cancel);

  let timedOut = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    killTree("SIGTERM");
    killTimer = setTimeout(() => killTree("SIGKILL"), KILL_GRACE_MS);
  }, options.timeoutMs);

  // Background processes may keep the pipes open after the command exits; stop waiting for them.
  void proc.exited.then(() => {
    drainTimer = setTimeout(() => {
      for (const cancel of cancels) cancel();
    }, STREAM_DRAIN_MS);
  });

  try {
    const [stdout, stderr] = await Promise.all([
      captureStream(proc.stdout, captureLimit, registerCancel),
      captureStream(proc.stderr, captureLimit, registerCancel),
    ]);
    await proc.exited;

    const out = finalizeOutput(stdout, options.secrets, maxChars);
    const err = finalizeOutput(stderr, options.secrets, maxChars);
    return {
      exitCode: proc.exitCode,
      signal: proc.signalCode == null ? null : String(proc.signalCode),
      timedOut,
      stdout: out.text,
      stderr: err.text,
      stdoutTruncated: out.truncated,
      stderrTruncated: err.truncated,
    };
  } finally {
    clearTimeout(timeoutTimer);
    clearTimeout(killTimer);
    clearTimeout(drainTimer);
  }
}
