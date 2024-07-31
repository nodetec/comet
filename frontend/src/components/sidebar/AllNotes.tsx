import { useAppState } from "~/store";
import { NotepadText } from "lucide-react";

export default function AllNotes() {
  const { feedType, setFeedType, setActiveNotebook, setActiveTag } = useAppState();

  function handleAllNotesClick() {
    setFeedType("all");
    setActiveNotebook(undefined);
    setActiveTag(undefined);
  }

  return (
    <span
      onClick={handleAllNotesClick}
      className={`flex cursor-pointer rounded-md items-center py-1.5 px-2 text-sm font-medium text-muted-foreground ${feedType === "all" && "bg-muted text-secondary-foreground"}`}
    >
      <NotepadText className="h-[1.1rem] w-[1.1rem]" />
      <span className="ml-1.5">All Notes</span>
    </span>
  );
}
