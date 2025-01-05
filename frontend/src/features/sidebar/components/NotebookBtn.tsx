import { useQueryClient } from "@tanstack/react-query";
import { type Notebook } from "&/comet/backend/models/models";
import { AppService } from "&/comet/backend/service";
import { useAppState } from "~/store";
import { NotebookIcon } from "lucide-react";

type Props = {
  notebook: Notebook;
};

export function NotebookBtn({ notebook }: Props) {
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);
  const setActiveNotebook = useAppState((state) => state.setActiveNotebook);
  const setActiveTag = useAppState((state) => state.setActiveTag);
  const queryClient = useQueryClient();

  async function handleClick() {
    console.log("Clicked");
    if (feedType === "notebook" && notebook.Active) {
      return;
    }
    if (feedType === "trash") {
      await queryClient.invalidateQueries({ queryKey: ["activeNote"] });
      await AppService.ClearActiveNote();
    }
    console.log("Setting Feed Type to notebook");
    setFeedType("notebook");
    setActiveNotebook(notebook);
    setActiveTag(undefined);
    await AppService.ClearActiveNote();
    void queryClient.invalidateQueries({ queryKey: ["activeNote"] });
    await AppService.SetNotebookActive(notebook.ID);
    void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    await AppService.ClearActiveTags();
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    void queryClient.invalidateQueries({ queryKey: ["tags"] });
  }

  const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    console.log("Right Clicked");
  };

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={`flex items-center rounded-md px-2 py-1.5 text-sm font-medium text-secondary-foreground ${notebook.Active && "bg-muted text-secondary-foreground"}`}
      style={
        {
          "--custom-contextmenu": "notebook",
          "--custom-contextmenu-data": `${JSON.stringify(notebook)}`,
        } as React.CSSProperties
      }
    >
      <NotebookIcon className="h-4 w-4 text-sky-500/90" />
      <span className="ml-1.5">{notebook.Name}</span>
    </button>
  );
}
