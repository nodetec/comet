import { chacha20poly1305 } from "@noble/ciphers/chacha";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function decryptBlob(data: Uint8Array, keyHex: string): Uint8Array {
  const key = hexToBytes(keyHex);
  const nonce = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const cipher = chacha20poly1305(key, nonce);
  return cipher.decrypt(ciphertext);
}
