export async function verifyResendSignature(
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
    console.error("[Resend Webhook] Missing required Svix headers");
    return false;
  }

  const timestampNum = Number.parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  const TOLERANCE_SECONDS = 300;

  if (Math.abs(now - timestampNum) > TOLERANCE_SECONDS) {
    console.error("[Resend Webhook] Timestamp outside tolerance window");
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;

  const secretWithoutPrefix = secret.startsWith("whsec_") ? secret.substring(6) : secret;

  const base64ToBytes = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const secretBytes = base64ToBytes(secretWithoutPrefix);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent),
  );

  const expectedSignatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  const signatures = svixSignature.split(" ");

  for (const versionedSig of signatures) {
    const [version, signature] = versionedSig.split(",");

    if (version === "v1" && signature === expectedSignatureBase64) {
      return true;
    }
  }

  console.error("[Resend Webhook] Signature verification failed - no match");
  return false;
}
