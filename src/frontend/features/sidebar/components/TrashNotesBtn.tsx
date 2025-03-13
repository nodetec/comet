import { SidebarButton } from "~/components/ui/SidebarButton";
import { useAppState } from "~/store";
import { TrashIcon } from "lucide-react";

export function TrashNotesBtn() {
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);

  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);

  const setActiveNoteId = useAppState((state) => state.setActiveNoteId);

  async function handleClick() {
    setFeedType("trash");
    setAppFocus({ panel: "sidebar", isFocused: true });
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
