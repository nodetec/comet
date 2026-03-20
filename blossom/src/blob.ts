export function parseBlobSha256(pathSegment: string): string | null {
  const trimmed = pathSegment.replace(/^\/+/, "");
  const sha256 = trimmed.replace(/\.[^.]+$/, "");
  return /^[a-f0-9]{64}$/.test(sha256) ? sha256 : null;
}

export async function computeSha256Hex(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
