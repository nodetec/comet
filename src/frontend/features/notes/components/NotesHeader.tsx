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

  function handleDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    console.log("double click");
    void window.api.toggleMaximize();
  }

  return (
    <div
      className="draggable flex justify-between pt-2"
      onDoubleClick={handleDoubleClick}
    >
      <div
        id="notes-header"
        onDoubleClick={(e) => e.stopPropagation()}
        className="flex cursor-default items-center justify-center gap-x-1 pl-2"
      >
        <h1 className="line-clamp-1 select-none truncate text-ellipsis whitespace-break-spaces break-all font-semibold">
          {title}
        </h1>
        <ChevronDown className="mt-1 mr-4 h-[1rem] w-[1rem] shrink-0 text-muted-foreground" />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={createNote.isPending}
        onClick={() =>
          createNote.mutate({ notebookId: activeNotebookId, tags: activeTags })
        }
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <PenBoxIcon />
      </Button>
    </div>
  );
}
