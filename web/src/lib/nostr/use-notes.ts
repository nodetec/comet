import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNostr } from "~/lib/nostr/use-nostr";
import {
  COMET_NOTE_COLLECTION,
  COMET_NOTE_SNAPSHOT_KIND,
  parseNoteSnapshotEvent,
  type Note,
} from "~/lib/nostr/snapshot";
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
        authors: [pubkey],
        kinds: [COMET_NOTE_SNAPSHOT_KIND],
        "#c": [COMET_NOTE_COLLECTION],
        limit: PAGE_SIZE,
      };
      if (pageParam !== undefined) {
        filter.until = pageParam;
      }

      const events = await relay.fetch([filter]);
      const results = await Promise.allSettled(
        events.map((event) => parseNoteSnapshotEvent(event)),
      );
      const notes = results.flatMap((result) => {
        if (result.status === "fulfilled") {
          return result.value ? [result.value] : [];
        }

        console.error("Failed to parse note snapshot:", result.reason);
        return [];
      });

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

  // Flatten and deduplicate note snapshots across pages (LWW by modifiedAt).
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

    return [...noteMap.values()]
      .filter((note) => !note.deletedAt)
      .toSorted((a, b) => b.modifiedAt - a.modifiedAt);
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
