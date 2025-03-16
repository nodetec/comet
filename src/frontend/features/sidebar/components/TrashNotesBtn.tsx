import { SidebarButton } from "~/components/ui/SidebarButton";
import { useAppState } from "~/store";
import { TrashIcon } from "lucide-react";

export function TrashNotesBtn() {
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);

  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);

  const setActiveNoteId = useAppState((state) => state.setActiveNoteId);

  const setActiveNotebookId = useAppState((state) => state.setActiveNotebookId);
  const setActiveNotebookName = useAppState(
    (state) => state.setActiveNotebookName,
  );

  const setActiveTags = useAppState((state) => state.setActiveTags);

  const setNoteSearch = useAppState((state) => state.setNoteSearch);

  async function handleClick() {
    setNoteSearch("");
    setActiveTags([]);
    setFeedType("trash");
    setAppFocus({ panel: "sidebar", isFocused: true });
    setActiveNotebookId(undefined);
    setActiveNotebookName(undefined);

    if (feedType === "trash") return;
    setActiveNoteId(undefined);
  }

  const isFocused =
    appFocus?.panel === "sidebar" && appFocus.isFocused && feedType === "trash";

  return (
    <SidebarButton
      isFocused={isFocused}
      onClick={handleClick}
      isActive={feedType === "trash"}
      icon={<TrashIcon data-focused={isFocused} />}
      label="Trash"
    />
  );
}
