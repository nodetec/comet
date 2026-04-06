import { useEffect, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { decryptBlob } from "~/lib/blob-crypto";
import type { BlobRef } from "~/lib/nostr/rumor";

const blobUrlCache = new Map<string, string>();

const blossomUrl = import.meta.env.VITE_BLOSSOM_URL as string;

function getCachedBlobUrl(ciphertextHash: string): string | null {
  return blobUrlCache.get(ciphertextHash) ?? null;
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
  const blobKey = `${blobRef.ciphertextHash}:${blobRef.encryptionKey}`;
  const cachedUrl = getCachedBlobUrl(blobRef.ciphertextHash);
  const [loadState, setLoadState] = useState(() => ({
    blobKey,
    error: false,
    url: cachedUrl,
  }));

  useEffect(() => {
    const initialUrl = getCachedBlobUrl(blobRef.ciphertextHash);
    setLoadState({
      blobKey,
      error: false,
      url: initialUrl,
    });

    if (initialUrl) {
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const fetchUrl = blossomUrl
          ? `${blossomUrl.replace(/\/$/, "")}/${blobRef.ciphertextHash}`
          : `/${blobRef.ciphertextHash}`;

        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error("fetch failed");
        const data = new Uint8Array(await response.arrayBuffer());
        const decrypted = decryptBlob(data, blobRef.encryptionKey);
        if (cancelled) {
          return;
        }
        const blob = new Blob([decrypted as BlobPart]);
        const objectUrl = URL.createObjectURL(blob);
        blobUrlCache.set(blobRef.ciphertextHash, objectUrl);
        setLoadState({
          blobKey,
          error: false,
          url: objectUrl,
        });
      } catch {
        if (!cancelled) {
          setLoadState({
            blobKey,
            error: true,
            url: null,
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
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
