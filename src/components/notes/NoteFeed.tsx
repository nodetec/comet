import { useQuery } from "@tanstack/react-query";
import { listNotes } from "~/api";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useGlobalState } from "~/store";

import NoteCard from "./NoteCard";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";

export default function NoteFeed() {
  async function fetchNotes() {
    const activeTag = useGlobalState.getState().activeTag;
    const search = useGlobalState.getState().noteSearch;
    const activeNote = useGlobalState.getState().activeNote;
    const setActiveNote = useGlobalState.getState().setActiveNote;
    const tagId = activeTag?.id;
    const apiResponse = await listNotes({ tagId, search });
    if (!apiResponse.data) {
      throw new Error("Data not found!");
    }
    if (!activeNote) {
      setActiveNote(apiResponse.data[0])
    }
    return apiResponse.data;
  }

  const { data } = useQuery({
    queryKey: ["notes"],
    queryFn: fetchNotes,
  });

  return (
    <div className="flex flex-col overflow-y-auto max-h-screen">
      <NoteFeedHeader />
      <SearchNotes />
      <ScrollArea className="flex h-full flex-col pt-2">
        {data?.map((note) => <NoteCard key={note.id} note={note} />)}
      </ScrollArea>
    </div>
  );
}
