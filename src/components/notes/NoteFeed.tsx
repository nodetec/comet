import { useQuery } from "@tanstack/react-query";
import { listNotes } from "~/api";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useGlobalState } from "~/store";

import NoteCard from "./NoteCard";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";

export default function NoteFeed() {
  async function fetchNotes() {
    const appContext = useGlobalState.getState().appContext;
    const search = useGlobalState.getState().noteSearch;
    const setAppContext = useGlobalState.getState().setAppContext;
    const tagId = appContext.activeTag?.id;
    const page = 1;
    const pageSize = 100;
    const filter = appContext.filter;
    const apiResponse = await listNotes({
      filter,
      tagId,
      search,
      page,
      pageSize,
    });

    if (apiResponse.error) {
      throw new Error(apiResponse.error);
    }

    if (apiResponse.data.length === 0 && !appContext.activeTag) {
      return [];
    }

    if (apiResponse.data.length === 0 && appContext.activeTag) {
      setAppContext({
        ...appContext,
        filter: "all",
        currentNote: undefined,
        currentTrashedNote: undefined,
      });
      return [];
    }

    if (
      appContext.filter === "all" &&
      appContext.currentNote === undefined &&
      appContext.activeTag === undefined &&
      apiResponse.data.length > 0
    ) {
      setAppContext({
        ...appContext,
        filter: "all",
        currentNote: apiResponse.data[0],
        activeTag: undefined,
      });
      return apiResponse.data;
    }

    if (appContext.filter === "all" && appContext.activeTag !== undefined && apiResponse.data.length > 0) {
      for (const note of apiResponse.data) {
        if (note.id === appContext.currentNote?.id) {
          setAppContext({
            ...appContext,
            filter: "all",
            currentNote: note,
            currentTrashedNote: undefined,
          });
          return apiResponse.data;
        }
      }
      setAppContext({
        ...appContext,
        filter: "all",
        currentNote: undefined,
        currentTrashedNote: undefined,
      });
      return apiResponse.data;
    }

    return apiResponse.data;
  }

  const { data } = useQuery({
    queryKey: ["notes"],
    queryFn: fetchNotes,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="flex max-h-screen flex-col overflow-y-auto">
      <NoteFeedHeader />
      <SearchNotes />
      <ScrollArea className="flex h-full flex-col pt-2">
        {data?.map((note) => <NoteCard key={note.id} note={note} />)}
      </ScrollArea>
    </div>
  );
}
