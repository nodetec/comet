import { useQueryClient } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";
import { useAppState } from "~/store";
import { FileText } from "lucide-react";

export function AllNotesBtn() {
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);
  const setActiveNotebook = useAppState((state) => state.setActiveNotebook);
  const setActiveTag = useAppState((state) => state.setActiveTag);

  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);

  const queryClient = useQueryClient();

  async function handleAllNotesClick() {
    setAppFocus({ panel: "sidebar", isFocused: true });
    if (feedType === "all") {
      return;
    }
    if (feedType === "trash") {
      await AppService.ClearActiveNote();
      await queryClient.invalidateQueries({ queryKey: ["activeNote"] });
    }
    setActiveNotebook(undefined);
    setActiveTag(undefined);
    await AppService.ClearActiveNotebooks();
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
    setFeedType("all");
    await queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    await queryClient.invalidateQueries({ queryKey: ["tags"] });
  }

  const isDataActive =
    appFocus?.panel === "sidebar" && appFocus.isFocused && feedType === "all";

  return (
    <button
      onClick={handleAllNotesClick}
      data-active={isDataActive}
      className={`ml-1 flex select-none items-center rounded-md px-2 py-1 text-sm font-medium text-secondary-foreground ${feedType === "all" && "bg-muted"} cursor-default data-[active=true]:bg-blue-500/50`}
    >
      <FileText
        data-active={isDataActive}
        className="h-4 w-4 text-blue-400/90 data-[active=true]:text-secondary-foreground"
      />
      <span className="ml-2.5">All Notes</span>
    </button>
  );
}
