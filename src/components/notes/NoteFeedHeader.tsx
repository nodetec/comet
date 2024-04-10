import { useQueryClient } from "@tanstack/react-query";
import { useGetCachedQueryData } from "~/hooks/useGetCachedQueryData";
import { useGlobalState } from "~/store";
import { type Note } from "~/types";
import { ArrowDownNarrowWide, PenBoxIcon } from "lucide-react";

import { Button } from "../ui/button";

export default function NoteFeedHeader() {
  const queryClient = useQueryClient();

  const { setActiveNote, activeTag } = useGlobalState();
  const data = useGetCachedQueryData("notes") as Note[];

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
    };

    queryClient.setQueryData(["notes"], (previousNotes: Note[]) => {
      return [newNote, ...previousNotes];
    });
    setActiveNote(newNote);
  }

  return (
    <div className="flex justify-between pt-2">
      <div className="flex justify-center items-center gap-x-1">
        <Button
          disabled={data?.[0] && data[0].id === -1}
          className="text-muted-foreground"
          onClick={handleNewNote}
          variant="ghost"
          size="icon"
        >
          <ArrowDownNarrowWide className="h-[1.2rem] w-[1.2rem]" />
        </Button>
        <h1 className="text-lg cursor-default font-bold">{activeTag?.name ?? "All Notes"}</h1>
      </div>
      <div>
        <Button
          disabled={data?.[0] && data[0].id === -1}
          className="text-muted-foreground"
          onClick={handleNewNote}
          variant="ghost"
          size="icon"
        >
          <PenBoxIcon className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </div>
    </div>
  );
}
