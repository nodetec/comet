import { useInfiniteQuery } from "@tanstack/react-query";
import { NoteService } from "&/github.com/nodetec/captains-log/service";
import { assignRef } from "~/lib/utils";
import { useAppState } from "~/store";
import { useInView } from "react-intersection-observer";

import { ScrollArea } from "../ui/scroll-area";
import NoteCard from "./NoteCard";

export default function NoteFeed() {
  const { setActiveNote } = useAppState();

  async function fetchNotes({ pageParam = 1 }) {
    console.log("FETCHING NOTES");
    const pageSize = 50;
    const notes = await NoteService.ListNotes(pageSize, pageParam);

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
      queryKey: ["notes"],
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
    return <div>Loading...</div>;
  }

  if (status === "error") {
    return <div>Error fetching notes</div>;
  }
  return (
    <ScrollArea className="w-full rounded-md">
      {/* <div */}
      {/*   className="flex h-full flex-col overflow-y-auto" */}
      {/*   style={{ overflowY: "auto", maxHeight: "80vh" }} */}
      {/* > */}
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
      {/* </div> */}
    </ScrollArea>
  );
}
