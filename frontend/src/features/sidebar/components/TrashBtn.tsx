import { useQueryClient } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";
import { useAppState } from "~/store";
import { Trash2Icon } from "lucide-react";

export function TrashBtn() {
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);
  const setActiveNotebook = useAppState((state) => state.setActiveNotebook);
  const setActiveTag = useAppState((state) => state.setActiveTag);

  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);

  const queryClient = useQueryClient();

  async function handleClick() {
    setAppFocus({ panel: "sidebar", isFocused: true });
    if (feedType === "trash") {
      return;
    }
    if (feedType === "all") {
      await queryClient.invalidateQueries({ queryKey: ["activeNote"] });
      await AppService.ClearActiveNote();
    }
    setFeedType("trash");
    setActiveNotebook(undefined);
    setActiveTag(undefined);
    await AppService.ClearActiveNotebooks();
    await AppService.ClearActiveTags();
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
    await queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    await queryClient.invalidateQueries({ queryKey: ["tags"] });
  }

  const isDataActive =
    appFocus?.panel === "sidebar" && appFocus.isFocused && feedType === "trash";

  return (
    <span
      onClick={handleClick}
      data-active={isDataActive}
      className={`ml-1 flex cursor-default items-center rounded-md px-2 py-1 text-sm font-medium text-secondary-foreground ${feedType === "trash" && "bg-muted text-secondary-foreground"} data-[active=true]:bg-blue-500/50`}
    >
      <Trash2Icon
        data-active={isDataActive}
        className="h-4 w-4 text-blue-400/90 data-[active=true]:text-secondary-foreground"
      />
      <span className="ml-2.5">Trash</span>
    </span>
  );
}
