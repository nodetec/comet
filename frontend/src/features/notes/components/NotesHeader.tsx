import { Button } from "~/components/ui/button";
import { useAppState } from "~/store";
import { ChevronDown, PenBoxIcon } from "lucide-react";

import { useCreateNote } from "../hooks/useCreateNote";

export function NotesHeader() {
  const feedType = useAppState((state) => state.feedType);
  const activeNotebook = useAppState((state) => state.activeNotebook);
  const createNote = useCreateNote();

  function title(feedType: string) {
    if (feedType === "all") return "All Notes";
    if (feedType === "notebook") return activeNotebook?.Name;
    if (feedType === "trash") return "Trash";
  }

  return (
    <div className="flex justify-between px-3 pt-2">
      {/* <SortDropdown> */}
      <div className="flex cursor-default items-center justify-center gap-x-1 pl-2">
        <h1 className="line-clamp-1 select-none truncate text-ellipsis whitespace-break-spaces break-all font-bold">
          {title(feedType)}
        </h1>
        <ChevronDown className="mr-4 mt-1 h-[1rem] w-[1rem] shrink-0 text-muted-foreground" />
      </div>
      {/* </SortDropdown> */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={createNote.isPending}
        onClick={() => createNote.mutate()}
      >
        <PenBoxIcon />
      </Button>
    </div>
  );
}
