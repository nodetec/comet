import { useEffect, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { decryptBlob } from "~/lib/blob-crypto";
import type { BlobRef } from "~/lib/nostr/snapshot";

type BlobUrlCacheEntry = {
  url: string | null;
  refCount: number;
  revokeTimer: ReturnType<typeof setTimeout> | null;
  pendingPromise: Promise<string> | null;
};

const blobUrlCache = new Map<string, BlobUrlCacheEntry>();
const BLOB_URL_REVOKE_DELAY_MS = 60_000;

const blossomUrl = import.meta.env.VITE_BLOSSOM_URL as string;

function getBlobCacheKey(blobRef: BlobRef): string {
  return `${blobRef.ciphertextHash}:${blobRef.encryptionKey}`;
}

function getOrCreateBlobUrlCacheEntry(blobKey: string): BlobUrlCacheEntry {
  let entry = blobUrlCache.get(blobKey);
  if (!entry) {
    entry = {
      url: null,
      refCount: 0,
      revokeTimer: null,
      pendingPromise: null,
    };
    blobUrlCache.set(blobKey, entry);
  }
  return entry;
}

function clearBlobUrlRevokeTimer(entry: BlobUrlCacheEntry): void {
  if (entry.revokeTimer == null) {
    return;
  }

  clearTimeout(entry.revokeTimer);
  entry.revokeTimer = null;
}

function getCachedBlobUrl(blobKey: string): string | null {
  return blobUrlCache.get(blobKey)?.url ?? null;
}

function scheduleBlobUrlRevoke(
  blobKey: string,
  entry: BlobUrlCacheEntry,
): void {
  if (entry.refCount > 0 || entry.revokeTimer != null || entry.url == null) {
    return;
  }

  entry.revokeTimer = setTimeout(() => {
    const currentEntry = blobUrlCache.get(blobKey);
    if (
      currentEntry == null ||
      currentEntry !== entry ||
      currentEntry.refCount > 0 ||
      currentEntry.url == null
    ) {
      return;
    }

    URL.revokeObjectURL(currentEntry.url);
    blobUrlCache.delete(blobKey);
  }, BLOB_URL_REVOKE_DELAY_MS);
}

function retainBlobUrl(blobKey: string): void {
  const entry = getOrCreateBlobUrlCacheEntry(blobKey);
  entry.refCount += 1;
  clearBlobUrlRevokeTimer(entry);
}

function releaseBlobUrl(blobKey: string): void {
  const entry = blobUrlCache.get(blobKey);
  if (!entry) {
    return;
  }

  entry.refCount = Math.max(0, entry.refCount - 1);
  if (entry.refCount > 0) {
    return;
  }

  if (entry.url != null) {
    scheduleBlobUrlRevoke(blobKey, entry);
    return;
  }

  if (entry.pendingPromise == null) {
    blobUrlCache.delete(blobKey);
  }
}

async function loadBlobUrl(
  ciphertextHash: string,
  encryptionKey: string,
  blobKey: string,
): Promise<string> {
  const entry = getOrCreateBlobUrlCacheEntry(blobKey);
  clearBlobUrlRevokeTimer(entry);

  if (entry.url != null) {
    return entry.url;
  }

  if (entry.pendingPromise != null) {
    return entry.pendingPromise;
  }

  const promise = (async () => {
    const fetchUrl = blossomUrl
      ? `${blossomUrl.replace(/\/$/, "")}/${ciphertextHash}`
      : `/${ciphertextHash}`;

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error("fetch failed");
    }

    const data = new Uint8Array(await response.arrayBuffer());
    const decrypted = decryptBlob(data, encryptionKey);
    const blob = new Blob([decrypted as BlobPart]);
    const objectUrl = URL.createObjectURL(blob);

    entry.url = objectUrl;
    return objectUrl;
  })();

  entry.pendingPromise = promise;

  try {
    return await promise;
  } finally {
    const currentEntry = blobUrlCache.get(blobKey);
    if (currentEntry === entry) {
      entry.pendingPromise = null;
      if (entry.refCount === 0) {
        if (entry.url != null) {
          scheduleBlobUrlRevoke(blobKey, entry);
        } else {
          blobUrlCache.delete(blobKey);
        }
      }
    }
  }
}

export function BlobImage({
  blobRef,
  alt,
  className,
}: {
  blobRef: BlobRef;
  alt?: string;
  className?: string;
}) {
  const blobKey = getBlobCacheKey(blobRef);
  const cachedUrl = getCachedBlobUrl(blobKey);
  const [loadState, setLoadState] = useState(() => ({
    blobKey,
    error: false,
    url: cachedUrl,
  }));

  useEffect(() => {
    retainBlobUrl(blobKey);

    const initialUrl = getCachedBlobUrl(blobKey);
    setLoadState({
      blobKey,
      error: false,
      url: initialUrl,
    });

    if (initialUrl) {
      return;
    }

    let cancelled = false;

    void loadBlobUrl(blobRef.ciphertextHash, blobRef.encryptionKey, blobKey)
      .then((url) => {
        if (cancelled) {
          return;
        }

        setLoadState({
          blobKey,
          error: false,
          url,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setLoadState({
          blobKey,
          error: true,
          url: null,
        });
      });

    return () => {
      cancelled = true;
      releaseBlobUrl(blobKey);
    };
  }, [blobKey, blobRef.ciphertextHash, blobRef.encryptionKey]);

  const url = loadState.blobKey === blobKey ? loadState.url : cachedUrl;
  const error = loadState.blobKey === blobKey ? loadState.error : false;

  if (error) {
    return (
      <div className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-2 py-1 text-xs">
        Failed to load image
      </div>
    );
  }

  if (!url) {
    return <Skeleton className="h-48 w-full rounded-md" />;
  }

  return (
    <img
      src={url}
      alt={alt ?? ""}
      className={`max-w-full rounded-md ${className ?? ""}`}
    />
  );
}
