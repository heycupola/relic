import { join } from "node:path";
import { PushError, type PushDeps } from "./types";

export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Prefers the project-local binary (node_modules/.bin) over the global one. */
export async function resolveBinary(deps: PushDeps, names: string[]): Promise<string | null> {
  for (const name of names) {
    const local = join(deps.cwd, "node_modules", ".bin", name);
    if (await deps.exists(local)) return local;
  }
  for (const name of names) {
    const global = deps.which(name);
    if (global) return global;
  }
  return null;
}

export function splitList(values: string[] | string | undefined): string[] {
  if (!values) return [];
  const list = Array.isArray(values) ? values : [values];
  return list
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function lastLines(text: string, count = 5): string {
  return text
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-count)
    .join("\n");
}

export function commandFailure(label: string, stderr: string, stdout = ""): PushError {
  const detail = lastLines(stderr) || lastLines(stdout);
  return new PushError(detail ? `${label}:\n${detail}` : label);
}

/** Parses JSON that may be preceded by a banner or update notice. */
export function parseJsonOutput<T>(output: string): T {
  const start = output.search(/[[{]/);
  if (start === -1) {
    throw new Error("No JSON found in command output");
  }
  return JSON.parse(output.slice(start)) as T;
}

/** Strips comments and trailing commas from JSONC while leaving string contents intact. */
export function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i] as string;
    const next = input[i + 1];

    if (inString) {
      output += char;
      if (char === "\\") {
        output += next ?? "";
        i += 2;
        continue;
      }
      if (char === '"') inString = false;
      i++;
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      i++;
      continue;
    }

    if (char === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }

    if (char === "/" && next === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    output += char;
    i++;
  }

  return stripTrailingCommas(output);
}

function stripTrailingCommas(input: string): string {
  let output = "";
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i] as string;

    if (inString) {
      output += char;
      if (char === "\\") {
        output += input[i + 1] ?? "";
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === ",") {
      const rest = input.slice(i + 1).trimStart();
      if (rest.startsWith("}") || rest.startsWith("]")) continue;
    }

    output += char;
  }

  return output;
}
