export function envToJson(envContent: string): string {
  const lines = envContent.split("\n");
  const secrets: Array<{
    key: string;
    value: string | number | boolean;
    type: string;
    scope: string;
  }> = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1);

    if (key === "") {
      continue;
    }

    value = value.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Detect type and convert value
    let typedValue: string | number | boolean = value;
    let type = "string";

    const lowerValue = value.toLowerCase().trim();
    if (lowerValue === "true" || lowerValue === "false") {
      type = "boolean";
      typedValue = lowerValue === "true";
    } else if (value !== "" && !Number.isNaN(Number(value)) && Number.isFinite(Number(value))) {
      type = "number";
      typedValue = Number(value);
    }

    secrets.push({
      key,
      value: typedValue,
      type,
      scope: "shared",
    });
  }

  return JSON.stringify(secrets, null, 2);
}

export function jsonToEnv(jsonContent: string): string {
  try {
    let parsed = JSON.parse(jsonContent);

    if (!Array.isArray(parsed)) {
      if (typeof parsed === "object" && parsed !== null && "key" in parsed) {
        parsed = [parsed];
      } else {
        return "";
      }
    }

    const lines: string[] = [];

    for (const item of parsed) {
      if (typeof item === "object" && item !== null) {
        const hasKey = "key" in item && typeof item.key === "string";
        const hasValue = "value" in item;

        if (hasKey && hasValue) {
          const key = String(item.key);
          // Convert value to string for .env format
          const value = item.value !== null && item.value !== undefined ? String(item.value) : "";

          if (key === "" && value === "") {
            continue;
          }

          // For .env format, always use string representation
          // But preserve the original value's string representation
          const needsQuotes = /[\s#"']/.test(value);
          const quotedValue = needsQuotes ? `"${value}"` : value;

          lines.push(`${key}=${quotedValue}`);
        }
      }
    }

    return lines.join("\n");
  } catch {
    return "";
  }
}

export function detectFormat(content: string): "env" | "json" | "unknown" {
  const trimmed = content.trim();

  if (trimmed === "") {
    return "unknown";
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      return "unknown";
    }
  }

  const lines = trimmed.split("\n");
  for (const line of lines) {
    const l = line.trim();
    if (l === "" || l.startsWith("#")) continue;

    if (l.match(/^[A-Za-z_][A-Za-z0-9_]*=/)) {
      return "env";
    }
  }

  return "unknown";
}
