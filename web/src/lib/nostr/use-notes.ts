import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNostr } from "~/lib/nostr/use-nostr";
import { unwrapGiftWrap } from "~/lib/nostr/nip59";
import { parseNoteRumor, getRumorType, type Note } from "~/lib/nostr/rumor";
import type { NostrFilter } from "~/lib/nostr/client";

const PAGE_SIZE = 20;

export function useNotes() {
  const { relay, isAuthenticated, pubkey } = useNostr();

  const query = useInfiniteQuery({
    queryKey: ["notes", pubkey],
    queryFn: async ({
      pageParam,
    }): Promise<{ notes: Note[]; cursor: number | undefined }> => {
      if (!relay || !pubkey) return { notes: [], cursor: undefined };

      const filter: NostrFilter = {
        kinds: [1059],
        "#p": [pubkey],
        limit: PAGE_SIZE,
      };
      if (pageParam !== undefined) {
        filter.until = pageParam;
      }

      const events = await relay.fetch([filter]);

      const notes: Note[] = [];
      for (const event of events) {
        try {
          const rumor = await unwrapGiftWrap(event);
          if (getRumorType(rumor) === "note") {
            const note = parseNoteRumor(rumor);
            if (!note.deletedAt) {
              notes.push(note);
            }
          }
        } catch (err) {
          console.error("Failed to unwrap event:", err);
        }
      }

      const cursor =
        events.length >= PAGE_SIZE
          ? Math.min(...events.map((e) => e.created_at)) - 1
          : undefined;

      return { notes, cursor };
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as number | undefined,
    enabled: isAuthenticated && !!relay && !!pubkey,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Flatten and deduplicate notes across pages (LWW by modifiedAt)
  const notes = useMemo(() => {
    if (!query.data) return [];

    const noteMap = new Map<string, Note>();
    for (const page of query.data.pages) {
      for (const note of page.notes) {
        const existing = noteMap.get(note.id);
        if (!existing || note.modifiedAt >= existing.modifiedAt) {
          noteMap.set(note.id, note);
        }
      }
    }

    return Array.from(noteMap.values()).sort(
      (a, b) => b.modifiedAt - a.modifiedAt,
    );
  }, [query.data]);

  return {
    notes,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    error: query.error?.message ?? null,
  };
}
