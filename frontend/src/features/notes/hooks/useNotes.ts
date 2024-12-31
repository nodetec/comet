import { useInfiniteQuery } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service/";
import { useAppState } from "~/store";

const useNotes = () => {
  const noteSearch = useAppState((state) => state.noteSearch);
  const activeNotebook = useAppState((state) => state.activeNotebook);
  const orderBy = useAppState((state) => state.orderBy);
  const timeSortDirection = useAppState((state) => state.timeSortDirection);
  const titleSortDirection = useAppState((state) => state.titleSortDirection);
  const feedType = useAppState((state) => state.feedType);

  async function fetchNotes({ pageParam = 1 }) {
    const limit = 20;
    const offset = pageParam;

    const sortDirection =
      orderBy === "title" ? titleSortDirection : timeSortDirection;

    const notes = await AppService.GetNotes(
      orderBy,
      sortDirection,
      limit,
      offset,
      noteSearch,
      feedType === "trash" ? true : false,
    );

    return {
      data: notes || [],
      nextPage: offset + 1,
      nextCursor: notes.length === limit ? offset + 1 : undefined,
    };
  }

  return useInfiniteQuery({
    queryKey: [
      "notes",
      feedType,
      activeNotebook?.ID,
      noteSearch,
      orderBy,
      timeSortDirection,
      titleSortDirection,
    ],
    queryFn: fetchNotes,
    gcTime: 10000,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
};

export default useNotes;
