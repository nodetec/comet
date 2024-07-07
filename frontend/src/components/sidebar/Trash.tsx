import { useAppState } from "~/store";
import { Trash2 } from "lucide-react";

export default function Trash() {
  const { feedType, setFeedType, setActiveNotebook, setActiveTag } = useAppState();

  function handleTrashNotesClick() {
    setFeedType("trash");
    setActiveNotebook(undefined);
    setActiveTag(undefined);
  }

  return (
    <span
      onClick={handleTrashNotesClick}
      className={`flex cursor-pointer rounded-md p-2 text-sm font-medium text-muted-foreground ${feedType === "trash" && "bg-muted text-secondary-foreground"}`}
    >
      <Trash2 className="h-[1.2rem] w-[1.2rem]" />
      <span className="ml-1.5">Trash</span>
    </span>
  );
}
