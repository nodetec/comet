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
  const setActiveNote = useAppState((state) => state.setActiveNote);

  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);
  const queryClient = useQueryClient();

  async function handleClick() {
    setAppFocus({ panel: "sidebar", isFocused: true });
    console.log("Clicked");
    if (feedType === "notebook" && notebook.Active) {
      return;
    }
    if (feedType === "trash" || feedType === "notebook") {
      setActiveNote(undefined);
      await queryClient.invalidateQueries({ queryKey: ["activeNote"] });
      await AppService.ClearActiveNote();
    }
    console.log("Setting Feed Type to notebook");
    setFeedType("notebook");
    setActiveNotebook(notebook);
    setActiveTag(undefined);
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

  const isDataActive =
    appFocus?.panel === "sidebar" &&
    appFocus.isFocused &&
    feedType === "notebook" &&
    notebook.Active;

  return (
    <button
      onClick={handleClick}
      data-active={isDataActive}
      onContextMenu={handleContextMenu}
      className={`flex cursor-default items-center rounded-md px-2 py-1 text-sm font-medium text-secondary-foreground ${notebook.Active && "bg-muted"} data-[active=true]:bg-blue-500/50`}
      style={
        {
          "--custom-contextmenu": "notebook",
          "--custom-contextmenu-data": `${JSON.stringify(notebook)}`,
        } as React.CSSProperties
      }
    >
      <NotebookIcon
        data-active={isDataActive}
        className="h-4 w-4 text-blue-400/90 data-[active=true]:text-secondary-foreground"
      />
      <span className="ml-2.5">{notebook.Name}</span>
    </button>
  );
}
