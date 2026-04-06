import { useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "~/components/ui/scroll-area";
import { BlobImage } from "~/components/dashboard/blob-image";
import type { BlobRef, Note } from "~/lib/nostr/rumor";

function formatFullDate(millis: number): string {
  return new Date(millis).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function NoteDetail({ note }: { note: Note }) {
  const blobMap = useMemo(() => {
    const next = new Map<string, BlobRef>();
    for (const blob of note.blobs) {
      next.set(blob.plaintextHash, blob);
    }
    return next;
  }, [note.blobs]);

  const imgComponent = useCallback(
    (props: React.ComponentProps<"img">) => {
      const src = props.src ?? "";

      if (src.startsWith("attachment://")) {
        const plaintextHash = src
          .replace("attachment://", "")
          .replace(/\.\w+$/, "");
        const blobRef = blobMap.get(plaintextHash);
        if (blobRef) {
          return <BlobImage blobRef={blobRef} alt={props.alt ?? undefined} />;
        }
        return (
          <span className="text-muted-foreground text-xs">
            [missing attachment]
          </span>
        );
      }

      return (
        <img
          src={src}
          alt={props.alt ?? ""}
          className="max-w-full rounded-md"
        />
      );
    },
    [blobMap],
  );

  // Strip the title from markdown since we render it in the header
  const content =
    note.title && note.markdown.startsWith(`# ${note.title}\n\n`)
      ? note.markdown.slice(`# ${note.title}\n\n`.length)
      : note.markdown;

  return (
    <ScrollArea className="min-h-0 flex-1 overflow-hidden">
      <article className="mx-auto max-w-2xl px-8 py-8">
        <header className="border-border/50 mb-6 border-b pb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {note.title || "Untitled"}
          </h1>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <time>{formatFullDate(note.modifiedAt)}</time>
            {note.tags.length > 0 && (
              <>
                <span className="text-border">·</span>
                {note.tags.map((tag) => (
                  <span key={tag} className="text-primary/80">
                    #{tag}
                  </span>
                ))}
              </>
            )}
          </div>
        </header>
        <div className="prose prose-sm dark:prose-invert prose-headings:tracking-tight prose-p:leading-relaxed prose-a:text-primary max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ img: imgComponent }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </article>
    </ScrollArea>
  );
}
