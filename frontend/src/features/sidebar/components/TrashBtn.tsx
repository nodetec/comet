import { useQueryClient } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";
import { useAppState } from "~/store";
import { Trash2Icon } from "lucide-react";

export function TrashBtn() {
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);
  const setActiveNotebook = useAppState((state) => state.setActiveNotebook);
  const setActiveTag = useAppState((state) => state.setActiveTag);

  const queryClient = useQueryClient();

  async function handleClick() {
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

  return (
    <span
      onClick={handleClick}
      className={`ml-1 flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm font-medium text-secondary-foreground ${feedType === "trash" && "bg-muted text-secondary-foreground"}`}
    >
      <Trash2Icon className="h-4 w-4 text-sky-500/90" />
      <span className="ml-1.5">Trash</span>
    </span>
  );
}
