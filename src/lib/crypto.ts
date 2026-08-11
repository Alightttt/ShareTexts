// Byte<->base64 helpers that avoid `Function.prototype.apply` on large arrays,
// which overflows the call stack for payloads above ~100KB.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret.padEnd(32, '0').substring(0, 32)),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("sharetext-salt"),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(text: string, key: CryptoKey): Promise<string> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = enc.encode(text);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  return JSON.stringify({
    i: bytesToBase64(iv),
    c: bytesToBase64(new Uint8Array(ciphertext))
  });
}

export async function decryptText(encrypted: string, key: CryptoKey): Promise<string> {
  const data = JSON.parse(encrypted);
  const iv = base64ToBytes(data.i);
  const cipher = base64ToBytes(data.c);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher
  );
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

export async function encryptBinaryChunk(chunk: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    chunk
  );
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result.buffer;
}

export async function decryptBinaryChunk(encrypted: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = new Uint8Array(encrypted, 0, 12);
  const ciphertext = new Uint8Array(encrypted, 12);
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
}
