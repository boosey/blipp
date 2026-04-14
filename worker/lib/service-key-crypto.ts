/**
 * AES-256-GCM encryption/decryption for service key values at rest.
 * Uses Web Crypto API (available in Cloudflare Workers).
 *
 * The master key is a 64-char hex string stored in SERVICE_KEY_ENCRYPTION_KEY env var.
 */

async function importMasterKey(hexKey: string): Promise<CryptoKey> {
  const raw = new Uint8Array(hexKey.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt a plaintext API key value.
 * Returns base64-encoded ciphertext and IV.
 */
export async function encryptKey(
  plaintext: string,
  masterKeyHex: string
): Promise<{ encrypted: string; iv: string }> {
  const key = await importMasterKey(masterKeyHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return {
    encrypted: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt a service key value.
 */
export async function decryptKey(
  encryptedBase64: string,
  ivBase64: string,
  masterKeyHex: string
): Promise<string> {
  const key = await importMasterKey(masterKeyHex);
  const iv = base64ToBuffer(ivBase64);
  const ciphertext = base64ToBuffer(encryptedBase64);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plainBuffer);
}

/**
 * Create a masked preview of an API key for safe display.
 * Shows first 6 and last 4 chars, e.g. "sk-ant-...Le0B".
 * Returns "***" for very short keys.
 */
export function maskKey(plaintext: string): string {
  if (plaintext.length <= 12) return "***configured***";
  return `${plaintext.slice(0, 6)}...${plaintext.slice(-4)}`;
}

// -- Helpers --

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
