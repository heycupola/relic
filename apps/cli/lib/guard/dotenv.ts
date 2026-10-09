import { basename } from "node:path";
import { IgnoreMatcher } from "./ignore";

const TEMPLATE_SEGMENTS = new Set(["example", "sample", "template"]);

function isTemplateName(name: string): boolean {
  return name
    .toLowerCase()
    .split(".")
    .some((segment) => TEMPLATE_SEGMENTS.has(segment));
}

export function isDotenvFileName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === ".env" || lower.startsWith(".env.")) return true;
  if (lower.endsWith(".env") && lower.length > ".env".length) return true;
  if (lower === ".dev.vars" || lower.startsWith(".dev.vars.")) return true;
  return false;
}

export class DotenvDetector {
  private readonly allow: IgnoreMatcher;

  constructor(allowPatterns: readonly string[] = []) {
    this.allow = new IgnoreMatcher(allowPatterns);
  }

  isViolation(path: string): boolean {
    const name = basename(path);
    if (!isDotenvFileName(name)) return false;
    if (isTemplateName(name)) return false;
    return !this.allow.ignores(path);
  }
}
