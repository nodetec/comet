import { useQueryClient } from "@tanstack/react-query";
import { useGlobalState } from "~/store";
import { NotepadText } from "lucide-react";

export default function AllNotes() {
  const { appContext, setAppContext } = useGlobalState();
  const queryClient = useQueryClient();

  const handleSetAllNotes = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    setAppContext({
      ...appContext,
      filter: "all",
      activeTag: undefined,
      currentTrashedNote: undefined,
    });
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  return (
    <div
      onClick={handleSetAllNotes}
      className={`flex cursor-pointer rounded-md p-2 text-sm font-medium text-muted-foreground ${appContext.filter === "all" && appContext.activeTag === undefined && "bg-muted"}`}
    >
      <NotepadText className="h-[1.2rem] w-[1.2rem]" />
      <span className="ml-1">All Notes</span>
    </div>
  );
}
