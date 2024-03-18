import { useEffect, useState } from "react";

import { listNotes } from "~/api";
import { type Note } from "~/types";

import NoteCard from "./NoteCard";
import { ScrollArea } from "~/components/ui/scroll-area"

export default function NoteFeed() {
  const [notes, setNotes] = useState<Note[]>([]);

  async function fetchNotes() {
    const apiResponse = await listNotes();
    console.log(apiResponse);
    if (apiResponse.data) {
      setNotes(apiResponse.data);
    }
  }

  useEffect(() => {
    void fetchNotes();
  }, []);

  return (
    <ScrollArea 
      className="flex h-full flex-col p-2">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </ScrollArea>
  );
}
