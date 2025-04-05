import { useMemo } from "react";

import { Button } from "~/components/ui/button";
import { useAppState } from "~/store";
import { ChevronDown, PenBoxIcon } from "lucide-react";

import { useCreateNote } from "../hooks/useCreateNote";

export function NotesHeader() {
  const feedType = useAppState((state) => state.feedType);
  const activeNotebookId = useAppState((state) => state.activeNotebookId);
  const activeNotebookName = useAppState((state) => state.activeNotebookName);
  const activeTags = useAppState((state) => state.activeTags);
  const createNote = useCreateNote();

  const title = useMemo(() => {
    if (feedType === "all") return "All Notes";
    if (feedType === "notebook") return activeNotebookName;
    if (feedType === "trash") return "Trash";
  }, [activeNotebookName, feedType]);

  return (
    <div className="draggable flex justify-between pt-2 pb-2">
      <div
        id="notes-header"
        className="flex cursor-default items-center justify-center gap-x-1 pl-2"
      >
        <h1 className="line-clamp-1 truncate font-semibold break-all text-ellipsis whitespace-break-spaces select-none">
          {title}
        </h1>
        <ChevronDown className="text-muted-foreground mt-1 mr-4 h-[1rem] w-[1rem] shrink-0" />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={createNote.isPending}
        onClick={() =>
          createNote.mutate({ notebookId: activeNotebookId, tags: activeTags })
        }
      >
        <PenBoxIcon />
      </Button>
    </div>
  );
}
