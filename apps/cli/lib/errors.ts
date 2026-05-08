import { ConvexError } from "convex/values";

export type ParsedConvexError = {
  code?: string;
  message: string;
};

export function parseConvexError(err: unknown): ParsedConvexError {
  if (err instanceof ConvexError) {
    let data = err.data;
    while (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        break;
      }
    }
    if (typeof data === "object" && data !== null) {
      const d = data as { code?: string; message?: string };
      return { code: d.code, message: d.message ?? err.message };
    }
  }
  return { message: err instanceof Error ? err.message : String(err) };
}

export function formatRunErrorMessage(err: unknown): string {
  const parsed = parseConvexError(err);
  if (parsed.code === "ENVIRONMENT_NOT_FOUND") {
    return `${parsed.message}. Open the TUI with \`relic\` to create it, or use \`relic run -e <name>\` with an existing environment.`;
  }
  return parsed.message;
}
