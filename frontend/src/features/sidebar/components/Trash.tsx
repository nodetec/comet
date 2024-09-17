import { useAppState } from "~/store";
import { Trash2 } from "lucide-react";

export function Trash() {
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);
  const setActiveNotebook = useAppState((state) => state.setActiveNotebook);
  const setActiveTag = useAppState((state) => state.setActiveTag);

  function handleTrashNotesClick() {
    setFeedType("trash");
    setActiveNotebook(undefined);
    setActiveTag(undefined);
  }

  return (
    <span
      onClick={handleTrashNotesClick}
      className={`flex cursor-pointer items-center rounded-md px-2 py-1 text-sm font-medium text-muted-foreground ${feedType === "trash" && "bg-muted text-secondary-foreground"}`}
    >
      <Trash2 className="h-[1.1rem] w-[1.1rem]" />
      <span className="ml-1.5">Trash</span>
    </span>
  );
}
