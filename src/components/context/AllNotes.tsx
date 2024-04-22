import { useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "~/store";
import { NotepadText } from "lucide-react";

export default function AllNotes() {
  const { filter, activeTag, setFilter, setActiveTag, setCurrentTrashedNote } = useAppContext();
  const queryClient = useQueryClient();

  const handleSetAllNotes = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();

    setFilter("all");
    setActiveTag(undefined);
    setCurrentTrashedNote(undefined);
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  return (
    <div
      onClick={handleSetAllNotes}
      className={`flex cursor-pointer rounded-md p-2 text-sm font-medium text-muted-foreground ${filter === "all" && activeTag === undefined && "bg-muted"}`}
    >
      <NotepadText className="h-[1.2rem] w-[1.2rem]" />
      <span className="ml-1">All Notes</span>
    </div>
  );
}
