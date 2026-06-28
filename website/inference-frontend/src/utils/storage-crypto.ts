/**
 * Client-side encryption for Chimera encrypted storage.
 * Uses PBKDF2 + AES-GCM. The key is never sent to the server.
 */

const SALT_LEN = 16;
const IV_LEN = 12;
const ITERATIONS = 100_000;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFile(file: File, password: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(password, salt);
  const plaintext = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const combined = new Uint8Array(SALT_LEN + IV_LEN + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LEN);
  combined.set(new Uint8Array(ciphertext), SALT_LEN + IV_LEN);
  return new Blob([combined], { type: 'application/octet-stream' });
}

export async function decryptFile(encryptedBlob: Blob, password: string): Promise<Blob> {
  const encrypted = new Uint8Array(await encryptedBlob.arrayBuffer());
  if (encrypted.length < SALT_LEN + IV_LEN) throw new Error('Invalid encrypted file');
  const salt = encrypted.slice(0, SALT_LEN);
  const iv = encrypted.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = encrypted.slice(SALT_LEN + IV_LEN);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Blob([plaintext]);
}

export async function sha256Buffer(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
