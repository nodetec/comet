import { useAppState } from "~/store";
import { FileText } from "lucide-react";

export default function AllNotes() {
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);
  const setActiveNotebook = useAppState((state) => state.setActiveNotebook);
  const setActiveTag = useAppState((state) => state.setActiveTag);

  function handleAllNotesClick() {
    setFeedType("all");
    setActiveNotebook(undefined);
    setActiveTag(undefined);
  }

  return (
    <span
      onClick={handleAllNotesClick}
      className={`flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground ${feedType === "all" && "bg-muted text-secondary-foreground"}`}
    >
      <FileText className="h-[1.1rem] w-[1.1rem]" />
      <span className="ml-1.5">All Notes</span>
    </span>
  );
}
