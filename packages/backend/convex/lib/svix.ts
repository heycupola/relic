import { createLogger } from "./logger";

const log = createLogger("svixSignature");

export async function verifySvixSignature(
  payload: string,
  headers: {
    "svix-id": string | null;
    "svix-timestamp": string | null;
    "svix-signature": string | null;
  },
  secret: string,
): Promise<boolean> {
  const svixId = headers["svix-id"];
  const svixTimestamp = headers["svix-timestamp"];
  const svixSignature = headers["svix-signature"];

  if (!svixId || !svixTimestamp || !svixSignature) {
    log.error("Missing required Svix headers");
    return false;
  }

  const timestampNum = /^\d+$/.test(svixTimestamp) ? Number(svixTimestamp) : Number.NaN;
  const now = Math.floor(Date.now() / 1000);
  const toleranceSeconds = 300;

  if (!Number.isFinite(timestampNum) || Math.abs(now - timestampNum) > toleranceSeconds) {
    log.error("Timestamp outside tolerance window");
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const secretWithoutPrefix = secret.startsWith("whsec_") ? secret.substring(6) : secret;

  const secretBytes = base64ToBytes(secretWithoutPrefix);
  const secretBuffer = new ArrayBuffer(secretBytes.length);
  new Uint8Array(secretBuffer).set(secretBytes);

  const key = await crypto.subtle.importKey(
    "raw",
    secretBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent),
  );
  const signatureArray = new Uint8Array(signatureBytes);
  const expectedSignatureBase64 = btoa(String.fromCharCode(...Array.from(signatureArray)));

  const signatures = svixSignature.split(" ");
  let matched = false;

  for (const versionedSig of signatures) {
    const [version, signature] = versionedSig.split(",");

    if (version === "v1" && signature !== undefined) {
      matched = timingSafeEqual(signature, expectedSignatureBase64) || matched;
    }
  }

  if (matched) return true;

  log.error("Signature verification failed - no match");
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < right.length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

function base64ToBytes(base64: string): Uint8Array {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  } catch {
    log.error("Invalid base64 in secret");
    throw new Error("Invalid webhook secret format");
  }
}
