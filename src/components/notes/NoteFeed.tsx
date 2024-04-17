import { useQuery } from "@tanstack/react-query";
import { listNotes } from "~/api";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useGlobalState } from "~/store";

import NoteCard from "./NoteCard";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";

export default function NoteFeed() {
  async function fetchNotes() {
    const activeNote = useGlobalState.getState().activeNote;
    const search = useGlobalState.getState().noteSearch;
    const setActiveNote = useGlobalState.getState().setActiveNote;
    const tagId = activeNote?.tag?.id;
    const apiResponse = await listNotes({ tagId, search });

    console.log("apiResponse", apiResponse);

    if (!apiResponse.data) {
      throw new Error("Data not found!");
    }

    if (apiResponse.data.length === 0 && !activeNote.tag) {
      return [];
    }

    if (apiResponse.data.length === 0 && activeNote.tag) {
      setActiveNote({
        context: "tag",
        note: undefined,
        tag: activeNote.tag,
        archivedNote: undefined,
      });
      return [];
    }

    if (
      activeNote.context === "all" &&
      activeNote.note === undefined &&
      apiResponse.data.length > 0
    ) {
      setActiveNote({
        context: "all",
        note: apiResponse.data[0],
        tag: activeNote.tag,
        archivedNote: undefined,
      });
      console.log("test 3");
      return apiResponse.data;
    }

    if (activeNote.context === "tag" && apiResponse.data.length > 0) {
      for (const note of apiResponse.data) {
        if (note.id === activeNote.note?.id) {
          setActiveNote({
            context: "tag",
            note: note,
            tag: activeNote.tag,
            archivedNote: undefined,
          });
          return apiResponse.data;
        }
      }
      setActiveNote({
        context: "tag",
        note: undefined,
        tag: activeNote.tag,
        archivedNote: undefined,
      });
      return apiResponse.data;
    }

    return apiResponse.data;
  }

  const { data } = useQuery({
    queryKey: ["notes"],
    queryFn: fetchNotes,
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
