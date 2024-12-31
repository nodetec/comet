import { useQueryClient } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";
import { useAppState } from "~/store";
import { FileText } from "lucide-react";

export function AllNotesBtn() {
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);
  const setActiveNotebook = useAppState((state) => state.setActiveNotebook);
  const setActiveTag = useAppState((state) => state.setActiveTag);

  const queryClient = useQueryClient();

  async function handleAllNotesClick() {
    if (feedType === "all") {
      return;
    }
    if (feedType === "trash") {
      await queryClient.invalidateQueries({ queryKey: ["activeNote"] });
      await AppService.ClearActiveNote();
    }
    setFeedType("all");
    setActiveNotebook(undefined);
    setActiveTag(undefined);
    await AppService.ClearActiveNotebooks();
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
    await queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    await queryClient.invalidateQueries({ queryKey: ["tags"] });
  }

  return (
    <button
      onClick={handleAllNotesClick}
      className={`ml-1 flex items-center rounded-md px-2 py-1.5 text-sm font-medium text-secondary-foreground ${feedType === "all" && "bg-muted text-secondary-foreground"}`}
    >
      <FileText className="h-4 w-4 text-sky-500/90" />
      <span className="ml-1.5">All Notes</span>
    </button>
  );
}
