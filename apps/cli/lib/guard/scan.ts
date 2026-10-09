import type { DotenvDetector } from "./dotenv";
import { hasInlineIgnore } from "./ignore";
import { MultiPatternMatcher, type PatternMatch } from "./matcher";
import type { SecretPatterns, SecretSource } from "./patterns";
import type { ScanChunk, ScanTargets } from "./sources";

export interface DotenvFinding {
  type: "dotenv";
  file: string;
  commit?: string;
}

export interface ValueFinding {
  type: "value";
  file: string;
  line: number;
  column: number;
  secrets: SecretSource[];
  preview: string;
  commit?: string;
}

export type Finding = DotenvFinding | ValueFinding;

export function maskValue(value: string): string {
  const visible = Math.min(2, Math.floor(value.length / 4));
  return `${value.slice(0, visible)}${"*".repeat(8)}`;
}

function dropContainedMatches(matches: PatternMatch[]): PatternMatch[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: PatternMatch[] = [];
  let coveredUntil = -1;
  for (const match of sorted) {
    if (match.end <= coveredUntil) continue;
    kept.push(match);
    coveredUntil = Math.max(coveredUntil, match.end);
  }
  return kept;
}

class LineIndex {
  private readonly starts: number[] = [0];

  constructor(private readonly text: string) {
    for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
      this.starts.push(i + 1);
    }
  }

  lineOf(offset: number): number {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.starts[mid]! <= offset) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  lineStart(line: number): number {
    return this.starts[line]!;
  }

  lineText(line: number): string {
    const start = this.starts[line]!;
    const next = this.starts[line + 1];
    return this.text.slice(start, next === undefined ? undefined : next - 1);
  }
}

function scanChunk(
  chunk: ScanChunk,
  matcher: MultiPatternMatcher,
  patterns: SecretPatterns,
): ValueFinding[] {
  const matches = matcher.findAll(chunk.text);
  if (matches.length === 0) return [];

  const lines = new LineIndex(chunk.text);
  const findings: ValueFinding[] = [];
  const seen = new Set<string>();

  for (const match of dropContainedMatches(matches)) {
    const line = lines.lineOf(match.start);
    if (hasInlineIgnore(lines.lineText(line))) continue;

    const dedupeKey = `${line}:${match.patternIndex}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    findings.push({
      type: "value",
      file: chunk.path,
      line: chunk.startLine + line,
      column: match.start - lines.lineStart(line) + 1,
      secrets: patterns.sources[match.patternIndex]!,
      preview: maskValue(patterns.values[match.patternIndex]!),
      ...(chunk.commit ? { commit: chunk.commit } : {}),
    });
  }

  return findings;
}

export function scanTargets(
  targets: ScanTargets,
  dotenv: DotenvDetector,
  patterns: SecretPatterns | null,
): Finding[] {
  const findings: Finding[] = [];
  const reportedDotenv = new Set<string>();

  for (const file of targets.files) {
    const key = `${file.commit ?? ""}:${file.path}`;
    if (reportedDotenv.has(key) || !dotenv.isViolation(file.path)) continue;
    reportedDotenv.add(key);
    findings.push({
      type: "dotenv",
      file: file.path,
      ...(file.commit ? { commit: file.commit } : {}),
    });
  }

  if (patterns && patterns.values.length > 0) {
    const matcher = new MultiPatternMatcher(patterns.values);
    for (const chunk of targets.chunks) {
      findings.push(...scanChunk(chunk, matcher, patterns));
    }
  }

  return findings;
}
