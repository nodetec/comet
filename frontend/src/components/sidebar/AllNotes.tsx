import { useAppState } from "~/store";
import { NotepadText } from "lucide-react";

export default function AllNotes() {
  const { feedType, setFeedType } = useAppState();

  function handleAllNotesClick() {
    setFeedType("all");
  }

  return (
    <span
      onClick={handleAllNotesClick}
      className={`flex cursor-pointer rounded-md p-2 text-sm font-medium text-muted-foreground ${feedType === "all" && "bg-muted text-secondary-foreground"}`}
    >
      <NotepadText className="h-[1.2rem] w-[1.2rem]" />
      <span className="ml-1">All Notes</span>
    </span>
  );
}
