import { parse } from "smol-toml";

export const CONFIG_FILE = "relic.toml";

export function parseProjectId(content: string): string | null {
  try {
    const data = parse(content);
    const projectId = data.project_id;
    return typeof projectId === "string" && projectId.trim() ? projectId.trim() : null;
  } catch {
    return null;
  }
}
