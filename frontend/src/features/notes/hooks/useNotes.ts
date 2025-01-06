import { useInfiniteQuery } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service/";
import { useAppState } from "~/store";

const useNotes = () => {
  const search = useAppState((state) => state.noteSearch);
  const activeNotebook = useAppState((state) => state.activeNotebook);
  const orderBy = useAppState((state) => state.orderBy);
  const timeSortDirection = useAppState((state) => state.timeSortDirection);
  const titleSortDirection = useAppState((state) => state.titleSortDirection);
  const feedType = useAppState((state) => state.feedType);

  async function fetchNotes({ pageParam = 1 }) {
    const limit = 10;
    const offset = (pageParam - 1) * limit;

    console.log("offset", offset);

    const orderDirection =
      orderBy === "title" ? titleSortDirection : timeSortDirection;

    console.log("orderBy", orderBy);

    const showTrashed = feedType === "trash";

    const notes = await AppService.GetNotes(
      orderBy,
      orderDirection,
      limit,
      offset,
      search,
      showTrashed,
    );

    for (const note of notes) {
      console.log("note", note.Title);
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
      activeNotebook?.ID,
      search,
      orderBy,
      timeSortDirection,
      titleSortDirection,
    ],
    queryFn: fetchNotes,
    gcTime: 10000,
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      if (lastPage.data.length === 0) {
        return undefined;
      }

      return lastPageParam + 1;
    },
  });
};

export default useNotes;
