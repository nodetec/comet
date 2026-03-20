import { useState, useEffect, useRef } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { decryptBlob } from "~/lib/blob-crypto";
import type { BlobRef } from "~/lib/nostr/rumor";

const blobUrlCache = new Map<string, string>();

const blossomUrl = import.meta.env.VITE_BLOSSOM_URL as string;

export function BlobImage({
  blobRef,
  alt,
  className,
}: {
  blobRef: BlobRef;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(
    () => blobUrlCache.get(blobRef.ciphertextHash) ?? null,
  );
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (url || fetchedRef.current) return;
    fetchedRef.current = true;

    async function load() {
      try {
        const cached = blobUrlCache.get(blobRef.ciphertextHash);
        if (cached) {
          setUrl(cached);
          return;
        }

        const fetchUrl = blossomUrl
          ? `${blossomUrl.replace(/\/$/, "")}/${blobRef.ciphertextHash}`
          : `/${blobRef.ciphertextHash}`;

        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error("fetch failed");
        const data = new Uint8Array(await response.arrayBuffer());
        const decrypted = decryptBlob(data, blobRef.encryptionKey);
        const blob = new Blob([decrypted as BlobPart]);
        const objectUrl = URL.createObjectURL(blob);
        blobUrlCache.set(blobRef.ciphertextHash, objectUrl);
        setUrl(objectUrl);
      } catch {
        setError(true);
      }
    }

    void load();
  }, [blobRef, url]);

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
