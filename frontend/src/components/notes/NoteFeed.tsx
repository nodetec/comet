import { useInfiniteQuery } from "@tanstack/react-query";
import { NoteService } from "&/github.com/nodetec/captains-log/service";
import { assignRef } from "~/lib/utils";
import { useAppState } from "~/store";
import { useInView } from "react-intersection-observer";

import { ScrollArea } from "../ui/scroll-area";
import NoteCard from "./NoteCard";

export default function NoteFeed() {
  const {
    setActiveNote,
    activeNotebook,
    activeTag,
    orderBy,
    timeSortDirection,
    titleSortDirection,
  } = useAppState();

  async function fetchNotes({ pageParam = 1 }) {
    const pageSize = 50;

    const notebookId = activeNotebook?.ID ?? 0;
    const tagId = activeTag?.ID ?? 0;

    const sortDirection =
      orderBy === "title" ? titleSortDirection : timeSortDirection;

    const notes = await NoteService.ListNotes(
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
      queryKey: [
        "notes",
        activeNotebook?.ID,
        activeTag?.ID,
        orderBy,
        timeSortDirection,
        titleSortDirection,
      ],
      queryFn: fetchNotes,
      gcTime: 3000,
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
    <ScrollArea className="w-full rounded-md">
      {data.pages.map((page, pageIndex) => (
        <ul key={pageIndex}>
          {page.data.map((project, noteIndex) => (
            <li
              key={noteIndex}
              ref={assignRef(lastNoteRef, pageIndex, noteIndex, data)}
            >
              <NoteCard note={project} />
            </li>
          ))}
        </ul>
      ))}
    </ScrollArea>
  );
}
