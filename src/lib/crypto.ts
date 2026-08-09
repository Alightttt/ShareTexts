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
  
  const ivArray = Array.from(iv);
  const cipherArray = Array.from(new Uint8Array(ciphertext));
  
  return btoa(JSON.stringify({
    i: btoa(String.fromCharCode.apply(null, ivArray)),
    c: btoa(String.fromCharCode.apply(null, cipherArray))
  }));
}

export async function decryptText(encrypted: string, key: CryptoKey): Promise<string> {
  const data = JSON.parse(atob(encrypted));
  const ivString = atob(data.i);
  const cipherString = atob(data.c);
  
  const iv = new Uint8Array(ivString.length);
  for (let i = 0; i < ivString.length; i++) iv[i] = ivString.charCodeAt(i);
    
  const cipher = new Uint8Array(cipherString.length);
  for (let i = 0; i < cipherString.length; i++) cipher[i] = cipherString.charCodeAt(i);
    
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher
  );
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}
