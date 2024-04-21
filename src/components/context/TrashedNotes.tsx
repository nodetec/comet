import { useQueryClient } from "@tanstack/react-query";
import { useGlobalState } from "~/store";
import { Trash2Icon } from "lucide-react";

export default function TrashedNotes() {
  const { appContext, setAppContext } = useGlobalState();
  const queryClient = useQueryClient();

  const handleSetTrashedNotes = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    setAppContext({
      ...appContext,
      filter: "trashed",
      currentNote: undefined,
      activeTag: undefined,
    });
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  return (
    <div
      onClick={handleSetTrashedNotes}
      className={`flex cursor-pointer rounded-md p-2 text-sm font-medium text-muted-foreground ${appContext.filter === "trashed" && "bg-muted"}`}
    >
      <Trash2Icon className="h-[1.2rem] w-[1.2rem]" />
      <span className="ml-1">Trash</span>
    </div>
  );
}
