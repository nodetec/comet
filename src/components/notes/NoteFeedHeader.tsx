import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalState } from "~/store";
import { PenBoxIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Note } from "~/types";

export default function NoteFeedHeader() {
  const queryClient = useQueryClient();

  const { setActiveNote } = useGlobalState();
  const { data, isLoading, error } = useQuery({ queryKey: ["notes"] });

  if (isLoading) return "Two Call NoteFeedHeader...";
  
  async function handleNewNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
    const newNote: Note = {
      id: -1,
      title: "Untitled",
      content: "",
      createdAt: Date.now().toString(),
      modifiedAt: Date.now().toString(),
    }

    queryClient.setQueryData(["notes"], (previousNotes: Note[]) =>  {
      return [
        newNote,
        ...previousNotes
      ];
    });
    setActiveNote(newNote);
  }

  return (
    <div className="flex justify-end">
      <Button disabled={data && data[0] && data[0].id === -1} onClick={handleNewNote} variant="outline" size="icon">
        <PenBoxIcon className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    </div>
  );
}
