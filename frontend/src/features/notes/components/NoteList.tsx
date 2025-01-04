import { ScrollArea } from "~/components/ui/scroll-area";
import { assignRef } from "~/lib/utils";
import { useInView } from "react-intersection-observer";

import useNotes from "../hooks/useNotes";
import { NoteCard } from "./NoteCard";

export const NoteList = () => {
  const { status, data, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useNotes();

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
    <ScrollArea type="scroll" className="h-screen">
      {data.pages.map((page, pageIndex) => (
        <div className="flex flex-col items-center px-3" key={pageIndex}>
          {page.data.map((note, noteIndex) => (
            <div
              className="mx-3 flex w-full flex-col items-center"
              key={noteIndex}
              ref={assignRef(lastNoteRef, pageIndex, noteIndex, data)}
            >
              <NoteCard
                note={note}
                index={noteIndex}
                length={page.data.length}
              />
            </div>
          ))}
        </div>
      ))}
    </ScrollArea>
  );
};
