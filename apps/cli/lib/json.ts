export type JsonErrorCode =
  | "not_logged_in"
  | "no_config"
  | "environment_not_found"
  | "folder_not_found"
  | "project_not_found"
  | "invalid_option"
  | "failed";

export interface JsonError {
  error: { code: JsonErrorCode; message: string };
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printJsonError(code: JsonErrorCode, message: string): void {
  printJson({ error: { code, message } } satisfies JsonError);
}
