import { ScrollArea } from "~/components/ui/scroll-area-old";
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
        console.log("fetching next page");
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

  const flattenedNotes = data.pages.flatMap((page) => page.data);

  return (
    <ScrollArea type="scroll" className="h-screen">
      <div className="flex flex-col items-center px-1 mr-[5px]">
        {flattenedNotes.map((note, index) => (
          <div
            className="mx-3 flex w-full flex-col items-center"
            key={index}
            ref={assignRef(
              lastNoteRef,
              Math.floor(index / data.pages[0].data.length),
              index % data.pages[0].data.length,
              data,
            )}
          >
            <NoteCard
              note={note}
              index={index}
              length={flattenedNotes.length}
            />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};
