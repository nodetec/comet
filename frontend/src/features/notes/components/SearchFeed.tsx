import { useInfiniteQuery } from "@tanstack/react-query";
import { NoteService } from "&/github.com/nodetec/comet/service";
import { assignRef } from "~/lib/utils";
import { useAppState } from "~/store";
import { useInView } from "react-intersection-observer";

import NoteCard from "./NoteCard";
import { ScrollArea } from "~/components/ui/scroll-area";

export default function SearchFeed() {
  const noteSearch = useAppState((state) => state.noteSearch);
  const activeNotebook = useAppState((state) => state.activeNotebook);
  const activeTag = useAppState((state) => state.activeTag);
  const titleSortDirection = useAppState((state) => state.titleSortDirection);
  const timeSortDirection = useAppState((state) => state.timeSortDirection);
  const setActiveNote = useAppState((state) => state.setActiveNote);
  const orderBy = useAppState((state) => state.orderBy);

  async function fetchNotes({ pageParam = 1 }) {
    const pageSize = 50;

    const notebookId = activeNotebook?.ID ?? 0;
    const tagId = activeTag?.ID ?? 0;

    const sortDirection =
      orderBy === "title" ? titleSortDirection : timeSortDirection;

    const notes = await NoteService.SearchNotes(
      noteSearch,
      notebookId,
      tagId,
      pageSize,
      pageParam,
      orderBy,
      sortDirection,
    );

    if (notes.length === 0) {
      setActiveNote(undefined);
    }

    return {
      data: notes || [],
      nextPage: pageParam + 1,
      nextCursor: notes.length === pageSize ? pageParam + 1 : undefined,
    };
  }

  const { status, data, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: ["search", noteSearch],
      gcTime: 3000,
      queryFn: fetchNotes,
      initialPageParam: 0,
      getNextPageParam: (lastPage, _pages) => lastPage.nextCursor ?? undefined,
    });

  const { ref: lastNoteRef } = useInView({
    onChange: (inView) => {
      if (inView && !isFetchingNextPage && hasNextPage) {
        void fetchNextPage();
      }
    },
  });

  if (status === "pending") {
    return undefined;
  }

  if (status === "error") {
    return <div>Error fetching notes</div>;
  }
  return (
    <ScrollArea className="h-screen">
      {data.pages.map((page, pageIndex) => (
        <div className="flex flex-col items-center px-3">
          {page.data.map((project, noteIndex) => (
            <div
              className="mx-3 flex w-full flex-col items-center"
              key={noteIndex}
              ref={assignRef(lastNoteRef, pageIndex, noteIndex, data)}
            >
              <NoteCard note={project} />
            </div>
          ))}
        </div>
      ))}
    </ScrollArea>
  );
}
