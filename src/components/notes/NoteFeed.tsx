import { useInfiniteQuery } from "@tanstack/react-query";
import { listNotes } from "~/api";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useAppContext } from "~/store";
import { useInView } from "react-intersection-observer";

import NoteCard from "./NoteCard";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";

export default function NoteFeed() {
  const { noteSearch } = useAppContext();

  async function fetchNotes({ pageParam = 1 }) {
    const app = useAppContext.getState();
    const filter = app.filter;
    const tagId = app.activeTag?.id;
    const search = app.noteSearch;
    const page = pageParam;
    const pageSize = 10;

    const apiResponse = await listNotes({
      filter,
      tagId,
      search,
      page,
      pageSize,
    });

    console.log("apiResponse", apiResponse);

    if (apiResponse.error) {
      throw new Error(apiResponse.error);
    }

    const notes = apiResponse.data;

    // TODO: return total pages from API
    // TODO: return total count from API
    // TODO: return next cursor from API
    // TODO: return previous cursor from API

    return {
      data: notes || [],
      nextPage: pageParam + 1,
      nextCursor: notes.length === pageSize ? page + 1 : undefined,
      prevCursor: page >= 1 ? page - 1 : undefined,
    };
  }

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    fetchPreviousPage,
    isFetchingPreviousPage,
    hasPreviousPage,
    // isFetching,
    status,
  } = useInfiniteQuery({
    queryKey: ["notes", { search: !!noteSearch }],
    queryFn: fetchNotes,
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    maxPages: 5,
    getNextPageParam: (lastPage, _pages) => lastPage.nextCursor,
    getPreviousPageParam: (firstPage, _pages) => firstPage.prevCursor,
    gcTime: noteSearch ? 0 : Infinity,
  });

  const { ref: firstNoteRef } = useInView({
    onChange: (inView) => {
      if (inView && !isFetchingPreviousPage && hasPreviousPage) {
        fetchPreviousPage();
        console.log("fetchPreviousPage");
      }
    },
  });

  const { ref: lastNoteRef } = useInView({
    onChange: (inView) => {
      if (inView && !isFetchingNextPage && hasNextPage) {
        fetchNextPage();
        console.log("fetchNextPage");
      }
    },
  });

  if (status === "error") return <p>Error: {error.message}</p>;

  return (
    <div className="flex max-h-screen flex-col overflow-y-auto">
      <NoteFeedHeader />
      <SearchNotes />
      <ScrollArea className="flex h-full flex-col pt-2">
        {data &&
          data.pages.map((group, pageIndex) => (
            <ul key={pageIndex}>
              {group.data?.map((note, noteIndex) => {
                // Determine if the note is the first or the last in the list
                const isFirstNote = pageIndex === 0 && noteIndex === 0;
                const isLastNote =
                  pageIndex === data.pages.length - 1 &&
                  noteIndex === group.data.length - 1;
                const refProp = isFirstNote
                  ? firstNoteRef
                  : isLastNote
                    ? lastNoteRef
                    : undefined;

                return (
                  <li ref={refProp} key={note.id}>
                    <NoteCard note={note} />
                  </li>
                );
              })}
            </ul>
          ))}
      </ScrollArea>
    </div>
  );
}
