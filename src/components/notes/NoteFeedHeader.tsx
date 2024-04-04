import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalState } from "~/store";
import { PenBoxIcon } from "lucide-react";

import { Button } from "../ui/button";

export default function NoteFeedHeader() {
  const queryClient = useQueryClient();

  const { setActiveNote } = useGlobalState();
  const { data, isLoading, error } = useQuery({ queryKey: ["notes"] });

  if (isLoading) return "Loading...";
  
  async function handleNewNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
    setActiveNote(undefined);

    queryClient.setQueryData(["notes"], (previousNotes) => {
      return [
        {
          id: -1,
          title: "Untitled",
          content: "",
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        },
        ...previousNotes
      ];
    });
  }

  return (
    <div className="flex justify-end">
      <Button disabled={data && data[0].id === -1} onClick={handleNewNote} variant="outline" size="icon">
        <PenBoxIcon className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    </div>
  );
}
