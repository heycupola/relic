// NOTE: This module has no Convex imports so the CLI, TUI, and web can share it.

export const DAY_MS = 24 * 60 * 60 * 1000;

export const MIN_ROTATION_DAYS = 1;
export const MAX_ROTATION_DAYS = 3650;

const MAX_DUE_SOON_WINDOW_DAYS = 14;
const DUE_SOON_RATIO = 0.2;

// Re-encryption writes land in a different mutation than the keyRotation row, so match loosely.
const KEY_ROTATION_MATCH_WINDOW_MS = 5 * 60 * 1000;

export type RotationStatus = "ok" | "due_soon" | "overdue" | "no_policy";
export type RotationPolicySource = "secret" | "environment";

export interface RotationPolicy {
  rotateEveryDays: number;
  source: RotationPolicySource;
}

export interface RotationState {
  ageDays: number;
  status: RotationStatus;
  rotateEveryDays: number | null;
  policySource: RotationPolicySource | null;
  dueAt: number | null;
  daysUntilDue: number | null;
}

export function isValidRotationDays(days: number): boolean {
  return Number.isInteger(days) && days >= MIN_ROTATION_DAYS && days <= MAX_ROTATION_DAYS;
}

export function resolveRotationPolicy(
  secretDays: number | undefined | null,
  environmentDays: number | undefined | null,
): RotationPolicy | null {
  if (secretDays != null) return { rotateEveryDays: secretDays, source: "secret" };
  if (environmentDays != null) return { rotateEveryDays: environmentDays, source: "environment" };
  return null;
}

export function getDueSoonWindowDays(rotateEveryDays: number): number {
  return Math.min(
    MAX_DUE_SOON_WINDOW_DAYS,
    Math.max(1, Math.ceil(rotateEveryDays * DUE_SOON_RATIO)),
  );
}

/**
 * Best guess for when a secret's value last changed, for rows written before
 * `valueChangedAt` existed. `updatedAt` is trusted unless it lines up with a project
 * key rotation, which re-encrypts values without changing them; then `createdAt` is used.
 */
export function inferValueChangedAt(
  secret: { createdAt: number; updatedAt: number; valueChangedAt?: number },
  keyRotationTimestamps: number[],
): number {
  if (secret.valueChangedAt !== undefined) return secret.valueChangedAt;

  const touchedByKeyRotation = keyRotationTimestamps.some(
    (rotatedAt) =>
      rotatedAt >= secret.updatedAt && rotatedAt - secret.updatedAt <= KEY_ROTATION_MATCH_WINDOW_MS,
  );

  return touchedByKeyRotation ? secret.createdAt : secret.updatedAt;
}

export function getRotationState(args: {
  valueChangedAt: number;
  policy: RotationPolicy | null;
  now: number;
}): RotationState {
  const ageMs = Math.max(0, args.now - args.valueChangedAt);
  const ageDays = Math.floor(ageMs / DAY_MS);

  if (!args.policy) {
    return {
      ageDays,
      status: "no_policy",
      rotateEveryDays: null,
      policySource: null,
      dueAt: null,
      daysUntilDue: null,
    };
  }

  const { rotateEveryDays, source } = args.policy;
  const dueAt = args.valueChangedAt + rotateEveryDays * DAY_MS;
  const daysUntilDue = Math.ceil((dueAt - args.now) / DAY_MS);

  let status: RotationStatus = "ok";
  if (args.now >= dueAt) {
    status = "overdue";
  } else if (daysUntilDue <= getDueSoonWindowDays(rotateEveryDays)) {
    status = "due_soon";
  }

  return {
    ageDays,
    status,
    rotateEveryDays,
    policySource: source,
    dueAt,
    daysUntilDue,
  };
}

const STATUS_ORDER: Record<RotationStatus, number> = {
  overdue: 0,
  due_soon: 1,
  ok: 2,
  no_policy: 3,
};

export function compareRotationStatus(a: RotationStatus, b: RotationStatus): number {
  return STATUS_ORDER[a] - STATUS_ORDER[b];
}

export function formatRotationAge(ageDays: number): string {
  if (ageDays < 1) return "<1d";
  return `${ageDays}d`;
}

export function formatRotationStatus(status: RotationStatus): string {
  switch (status) {
    case "ok":
      return "ok";
    case "due_soon":
      return "due soon";
    case "overdue":
      return "overdue";
    case "no_policy":
      return "no policy";
  }
}
