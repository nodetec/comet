import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

const ATTACHMENTS_PREFIX = "attachments/";

let cachedBasePath: string | null = null;
let cachedAssetPrefix: string | null = null;

export async function initAttachmentsBasePath(): Promise<void> {
  cachedBasePath = await invoke<string>("get_attachments_dir");
  // Pre-compute the asset:// prefix for unresolveImageSrc
  cachedAssetPrefix = convertFileSrc(cachedBasePath + "/");
}

export function getAttachmentsBasePath(): string {
  if (!cachedBasePath) {
    throw new Error("Attachments base path not initialized");
  }
  return cachedBasePath;
}

export function resolveImageSrc(src: string): string {
  if (src.startsWith(ATTACHMENTS_PREFIX)) {
    const basePath = getAttachmentsBasePath();
    const absolutePath = `${basePath}/${src.slice(ATTACHMENTS_PREFIX.length)}`;
    return convertFileSrc(absolutePath);
  }
  return src;
}

export function unresolveImageSrc(src: string): string {
  if (!cachedAssetPrefix) return src;

  if (src.startsWith(cachedAssetPrefix)) {
    const filename = decodeURIComponent(src.slice(cachedAssetPrefix.length));
    return `${ATTACHMENTS_PREFIX}${filename}`;
  }

  return src;
}

export async function importImage(
  sourcePath: string,
): Promise<{ assetUrl: string; altText: string }> {
  const result = await invoke<{ relativePath: string; absolutePath: string }>(
    "import_image",
    { sourcePath },
  );
  const assetUrl = convertFileSrc(result.absolutePath);
  const fileName = sourcePath.split("/").pop() ?? "";
  const altText = fileName.replace(/\.[^.]+$/, "");
  return { assetUrl, altText };
}
