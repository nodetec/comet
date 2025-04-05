import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useAppState } from "~/store";
import { type Note } from "$/types/Note";

const useNotes = () => {
  const noteSearch = useAppState((state) => state.noteSearch);
  const activeNotebookId = useAppState((state) => state.activeNotebookId);
  const feedType = useAppState((state) => state.feedType);
  const activeTags = useAppState((state) => state.activeTags);

  async function fetchNotes({ pageParam = 1 }) {
    const limit = 10;
    const offset = (pageParam - 1) * limit;

    const trashFeed = feedType === "trash";

    let notebookId: string | undefined;
    if (feedType === "notebook") {
      notebookId = activeNotebookId;
    } else if (feedType === "all") {
      notebookId = undefined;
    }

    let notes: Note[] = [];

    if (noteSearch !== "") {
      notes = await window.api.searchNotes(
        noteSearch,
        limit,
        offset,
        trashFeed,
        activeNotebookId,
      );
    } else {
      notes = await window.api.getNoteFeed(
        offset,
        limit,
        notebookId,
        trashFeed,
        activeTags,
      );
    }

    return {
      data: notes || [],
      nextPage: pageParam + 1,
      nextCursor: notes.length === limit ? pageParam + 1 : undefined,
    };
  }

  return useInfiniteQuery({
    queryKey: ["notes", feedType, activeNotebookId, activeTags, noteSearch],
    queryFn: fetchNotes,
    gcTime: 0,
    staleTime: 0,
    initialPageParam: 1,
    placeholderData: keepPreviousData,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      if (lastPage.data.length === 0) {
        return undefined;
      }

      return lastPageParam + 1;
    },
  });
};

export default useNotes;
