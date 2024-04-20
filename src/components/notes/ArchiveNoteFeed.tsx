import { useQuery } from "@tanstack/react-query";
import { listArchivedNotes } from "~/api";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useGlobalState } from "~/store";

import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";
import ArchiveNoteCard from "./ArchiveNoteCard";

export default function ArchiveNoteFeed() {
  async function fetchNotes() {
    const search = useGlobalState.getState().noteSearch;
    // const activeNote = useGlobalState.getState().activeNote;
    // const setActiveNote = useGlobalState.getState().setActiveNote;
    const apiResponse = await listArchivedNotes({ tagId: undefined, search });

    if (!apiResponse.data) {
      throw new Error("Data not found!");
    }

    // if (!activeArchiveNote) {
    //   setActiveArchiveNote(apiResponse.data[0])
    // }

    return apiResponse.data;
  }

  const { data } = useQuery({
    queryKey: ["archived_notes"],
    queryFn: fetchNotes,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="flex flex-col overflow-y-auto max-h-screen">
      <NoteFeedHeader />
      <SearchNotes />
      <ScrollArea className="flex h-full flex-col pt-2">
        {data?.map((note) => <ArchiveNoteCard key={note.id} note={note} />)}
      </ScrollArea>
    </div>
  );
}
