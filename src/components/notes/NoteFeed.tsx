import { listNotes } from "~/api";
import { type Note } from "~/types";

import NoteCard from "./NoteCard";
import { ScrollArea } from "~/components/ui/scroll-area"
import { useQuery } from "@tanstack/react-query";

export default function NoteFeed() {
  async function fetchNotes() {
    const apiResponse = await listNotes();
    console.log(apiResponse);
    if (apiResponse.data) {
      return apiResponse.data;
    }
  }

  const { data:notesData, isLoading, error } = useQuery({ queryKey: ['notes'], queryFn: fetchNotes});

  if (isLoading) return "Loading...";

  return (
    <ScrollArea 
      className="flex h-full flex-col p-2">
      {notesData && notesData.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </ScrollArea>
  );
}
