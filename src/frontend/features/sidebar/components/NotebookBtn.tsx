import { SidebarButton } from "~/components/ui/SidebarButton";
import { useAppState } from "~/store";
import { type Notebook } from "$/types/Notebook";
import { BookIcon } from "lucide-react";

type NotebookBtnProps = {
  notebook: Notebook;
};

export function NotebookBtn({ notebook }: NotebookBtnProps) {
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);

  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);

  const activeNotebookId = useAppState((state) => state.activeNotebookId);
  const setActiveNotebookId = useAppState((state) => state.setActiveNotebookId);
  const setActiveNotebookName = useAppState(
    (state) => state.setActiveNotebookName,
  );

  const setActiveTags = useAppState((state) => state.setActiveTags);

  async function handleClick() {
    setActiveTags([]);
    setFeedType("notebook");
    setActiveNotebookName(notebook.name);
    setActiveNotebookId(notebook._id);
    setAppFocus({ panel: "sidebar", isFocused: true });
  }

  const handleContextMenu = (_: React.MouseEvent<HTMLDivElement>) => {
    window.api.notebookContextMenu(notebook._id);
  };

  const isFocused =
    appFocus?.panel === "sidebar" &&
    appFocus.isFocused &&
    feedType === "notebook" &&
    notebook._id === activeNotebookId;

  return (
    <SidebarButton
      onContextMenu={handleContextMenu}
      isFocused={isFocused}
      onClick={handleClick}
      isActive={feedType === "notebook" && notebook._id === activeNotebookId}
      icon={<BookIcon data-focused={isFocused} />}
      label={notebook.name}
    />
  );
}
