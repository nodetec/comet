import { listNotes } from "~/api";
import { Tag, type Note } from "~/types";

import NoteCard from "./NoteCard";
import { ScrollArea } from "~/components/ui/scroll-area"
import { useQuery } from "@tanstack/react-query";
import { useGlobalState } from "~/store";

export default function NoteFeed() {
  async function fetchNotes(): Promise<Note[]> {
    const activeTag = useGlobalState.getState().activeTag;

    const tagId = activeTag?.id;
    
    const apiResponse = await listNotes({tagId});
    console.log(apiResponse);
    if (!apiResponse.data) {
      throw new Error('Data not found!')
    }
    return apiResponse.data;

  }

  const { data:notesData, isLoading, error } = useQuery({ queryKey: ['notes'], queryFn: fetchNotes });

  if (isLoading) return "One Call NoteFeed...";

  return (
    <ScrollArea 
      className="flex h-full flex-col p-2">
      {notesData && notesData.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </ScrollArea>
  );
}
