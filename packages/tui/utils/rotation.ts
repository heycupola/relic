import {
  formatRotationAge,
  getRotationState,
  isValidRotationDays,
  MAX_ROTATION_DAYS,
  type RotationStatus,
  resolveRotationPolicy,
} from "@repo/backend";
import { THEME_COLORS } from "./constants";

export interface RotationBadge {
  text: string;
  color: string;
  status: RotationStatus;
}

const CLEAR_POLICY_INPUTS = new Set(["0", "off", "none", "clear"]);

export const POLICY_INPUT_MAX_LENGTH = String(MAX_ROTATION_DAYS).length;

export function getSecretRotationBadge(
  secret: { valueChangedAt?: number; rotateEveryDays?: number },
  environmentRotateEveryDays: number | undefined,
  now = Date.now(),
): RotationBadge | null {
  if (secret.valueChangedAt === undefined) return null;

  const state = getRotationState({
    valueChangedAt: secret.valueChangedAt,
    policy: resolveRotationPolicy(secret.rotateEveryDays, environmentRotateEveryDays),
    now,
  });
  const age = formatRotationAge(state.ageDays);

  switch (state.status) {
    case "overdue":
      return { text: `! ${age}`, color: THEME_COLORS.error, status: state.status };
    case "due_soon":
      return { text: `~ ${age}`, color: THEME_COLORS.warning, status: state.status };
    default:
      return { text: age, color: THEME_COLORS.textDim, status: state.status };
  }
}

export function formatPolicyLabel(rotateEveryDays: number | undefined): string | null {
  return rotateEveryDays === undefined ? null : `↻ ${rotateEveryDays}d`;
}

export function parsePolicyInput(
  input: string,
): { ok: true; rotateEveryDays: number | null } | { ok: false; error: string } {
  const value = input.trim().toLowerCase();
  if (CLEAR_POLICY_INPUTS.has(value)) return { ok: true, rotateEveryDays: null };

  const days = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!isValidRotationDays(days)) {
    return { ok: false, error: `1-${MAX_ROTATION_DAYS} days, or 0 to clear` };
  }
  return { ok: true, rotateEveryDays: days };
}
