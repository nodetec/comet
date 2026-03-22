import { invoke, convertFileSrc  } from "@tauri-apps/api/core";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

const ATTACHMENT_PREFIX = "attachment://";

let cachedBasePath: string | null = null;

export async function initAttachmentsBasePath(): Promise<void> {
  cachedBasePath = await invoke<string>("get_attachments_dir");
}

export function getAttachmentsBasePath(): string {
  if (!cachedBasePath) {
    throw new Error("Attachments base path not initialized");
  }
  return cachedBasePath;
}

/**
 * Resolve an attachment:// URI to an asset:// URL for rendering.
 * Passes through non-attachment URIs unchanged.
 */
export function resolveImageSrc(src: string): string {
  if (src.startsWith(ATTACHMENT_PREFIX)) {
    const filename = src.slice(ATTACHMENT_PREFIX.length);
    const basePath = getAttachmentsBasePath();
    const absolutePath = `${basePath}/${filename}`;
    return convertFileSrc(absolutePath);
  }
  return src;
}

/**
 * Convert an asset:// URL back to an attachment:// URI for markdown storage.
 * Passes through non-asset URLs unchanged.
 */
export function unresolveImageSrc(src: string): string {
  if (!cachedBasePath) return src;

  const assetPrefix = convertFileSrc(cachedBasePath + "/");
  if (src.startsWith(assetPrefix)) {
    const filename = decodeURIComponent(src.slice(assetPrefix.length));
    return `${ATTACHMENT_PREFIX}${filename}`;
  }

  return src;
}

export async function importImage(
  sourcePath: string,
): Promise<{ assetUrl: string; altText: string }> {
  const result = await invoke<{ uri: string; hash: string }>("import_image", {
    sourcePath,
  });
  const assetUrl = resolveImageSrc(result.uri);
  const fileName = sourcePath.split("/").pop() ?? "";
  const altText = fileName.replace(/\.[^.]+$/, "");
  return { assetUrl, altText };
}
