import { useMemo } from "react";

import { Button } from "~/components/ui/button";
import { useAppState } from "~/store";
import { PenBoxIcon } from "lucide-react";

import { useCreateNote } from "../hooks/useCreateNote";

export function NotesHeader() {
  const feedType = useAppState((state) => state.feedType);
  const activeNotebook = useAppState((state) => state.activeNotebook);
  const createNote = useCreateNote();
  // const activeNote = useAppState((state) => state.activeNote);

  const title = useMemo(() => {
    if (feedType === "all") return "All Notes";
    if (feedType === "notebook") return activeNotebook?.Name;
    if (feedType === "trash") return "Trash";
  }, [feedType, activeNotebook]);

  // const handleLeftClick = (event: React.MouseEvent<HTMLDivElement>) => {
  //   event.preventDefault(); // Prevent the default left-click behavior
  //   const element = document.getElementById("notes-header");
  //   console.log("Left Clicked");

  //   if (element) {
  //     const rect = element.getBoundingClientRect();
  //     const contextMenuEvent = new MouseEvent("contextmenu", {
  //       bubbles: true,
  //       cancelable: true,
  //       view: window,
  //       clientX: rect.left,
  //       clientY: rect.bottom,
  //     });
  //     element.dispatchEvent(contextMenuEvent);
  //   }
  // };

  // const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
  //   event.preventDefault();
  //   console.log("Right Clicked");
  // };

  return (
    <div className="flex justify-between px-3 pt-2">
      <div
        id="notes-header"
        className="flex cursor-default items-center justify-center gap-x-1 pl-2"
        // onClick={handleLeftClick}
        // onContextMenu={handleContextMenu}
        // style={
        //   {
        //     "--custom-contextmenu": "note_feed",
        //     "--custom-contextmenu-data": `${JSON.stringify(activeNote)}`,
        //   } as React.CSSProperties
        // }
      >
        <h1 className="line-clamp-1 select-none truncate text-ellipsis whitespace-break-spaces break-all font-bold">
          {title}
        </h1>
        {/* <ChevronDown className="mr-4 mt-1 h-[1rem] w-[1rem] shrink-0 text-muted-foreground" /> */}
      </div>
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
