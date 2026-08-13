// AES-GCM encryption for Canvas tokens at rest. Convex documents are not
// encrypted per-field, and a Canvas token is a password-equivalent
// credential to FERPA-protected data, so we encrypt before storing.
// Requires CANVAS_ENCRYPTION_KEY (base64, 32 bytes) in the Convex
// deployment environment. Generate one with:
//   openssl rand -base64 32
// Web Crypto is only available in actions, so encrypt/decrypt must be
// called from actions, never from queries or mutations.

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

async function importKey(): Promise<CryptoKey> {
  const raw = process.env.CANVAS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CANVAS_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` " +
        "and set it in the Convex dashboard (Settings > Environment Variables).",
    );
  }
  const keyBytes = base64ToBytes(raw.trim());
  if (keyBytes.length !== 32) {
    throw new Error("CANVAS_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return crypto.subtle.importKey("raw", keyBytes, ALGORITHM, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const payload = new Uint8Array(iv.length + ciphertext.length);
  payload.set(iv);
  payload.set(ciphertext, iv.length);
  return bytesToBase64(payload);
}

export async function decryptSecret(payload: string): Promise<string> {
  const key = await importKey();
  const bytes = base64ToBytes(payload);
  const iv = bytes.slice(0, IV_LENGTH);
  const ciphertext = bytes.slice(IV_LENGTH);
  const plain = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plain);
}
