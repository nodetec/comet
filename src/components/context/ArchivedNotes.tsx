import { useQueryClient } from "@tanstack/react-query";
import { useGlobalState } from "~/store";
import { Trash2Icon, TrashIcon } from "lucide-react";

export default function ArchivedNotes() {
  const { activeNote, setActiveNote } = useGlobalState();
  const queryClient = useQueryClient();

  const handleSetArchivedNotes = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    setActiveNote({
      context: "archived",
      note: undefined,
      tag: undefined,
      archivedNote: activeNote.archivedNote,
    });
    await queryClient.invalidateQueries({ queryKey: ["archivedNotes"] });
  };

  return (
    <div
      onClick={handleSetArchivedNotes}
      className={`flex cursor-pointer rounded-md p-2 text-sm font-medium text-muted-foreground ${activeNote.context === "archived" && "bg-muted"}`}
    >
      <Trash2Icon className="h-[1.2rem] w-[1.2rem]" />
      <span className="ml-1">Trash</span>
    </div>
  );
}

