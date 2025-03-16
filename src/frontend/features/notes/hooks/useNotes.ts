import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useAppState } from "~/store";
import { Note } from "$/types/Note";

const useNotes = () => {
  const noteSearch = useAppState((state) => state.noteSearch);
  const activeNotebookId = useAppState((state) => state.activeNotebookId);
  //   const orderBy = useAppState((state) => state.orderBy);
  //   const timeSortDirection = useAppState((state) => state.timeSortDirection);
  //   const titleSortDirection = useAppState((state) => state.titleSortDirection);
  const feedType = useAppState((state) => state.feedType);
  const activeTags = useAppState((state) => state.activeTags);

  async function fetchNotes({ pageParam = 1 }) {
    const limit = 10;
    const offset = (pageParam - 1) * limit;

    // const orderDirection =
    //   orderBy === "title" ? titleSortDirection : timeSortDirection;

    // TODO: put search order on notebook
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
        activeNotebookId,
      );
    } else {
      notes = await window.api.getNoteFeed(
        offset,
        limit,
        "contentUpdatedAt",
        "desc",
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
    queryKey: [
      "notes",
      feedType,
      activeNotebookId,
      activeTags,
      noteSearch,
      //   orderBy,
      //   timeSortDirection,
      //   titleSortDirection,
    ],
    queryFn: fetchNotes,
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
