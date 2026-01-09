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
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } catch (_error) {
      console.error("[Resend Webhook] Invalid base64 in secret");
      throw new Error("Invalid webhook secret format");
    }
  };

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

  for (const versionedSig of signatures) {
    const [version, signature] = versionedSig.split(",");

    if (version === "v1" && signature === expectedSignatureBase64) {
      return true;
    }
  }

  console.error("[Resend Webhook] Signature verification failed - no match");
  return false;
}
