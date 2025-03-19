import React, { useCallback, useMemo } from "react";

import { Separator } from "~/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { parseContent } from "~/lib/markdown";
import { cn, fromNow } from "~/lib/utils";
import { useAppState } from "~/store";
import { type Note } from "$/types/Note";
import { SendIcon } from "lucide-react";
import Highlighter from "react-highlight-words";
import { searchContent } from "~/lib/markdown/searchContent";

type Props = {
  note: Note;
  index: number;
  length: number;
};

// Wrap the component with React.memo to prevent unnecessary re-renders
function NoteCardBase({ note, index, length }: Props) {
  const activeNoteId = useAppState((state) => state.activeNoteId);
  const setActiveNoteId = useAppState((state) => state.setActiveNoteId);

  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);

  const feedType = useAppState((state) => state.feedType);

  const active = activeNoteId === note._id;

  const noteSearch = useAppState((state) => state.noteSearch);

  // Memoize parsed content
  // const parsedContent = useMemo(
  //   () => parseContent(note.content) || "No content \n ",
  //   [note.content],
  // );

  // Memoize parsed content with search highlighting
  const parsedContentWithSearch = useMemo(
    () => searchContent(note.previewContent, noteSearch) || "",
    [note.previewContent, noteSearch],
  );

  // Memoize date formatting
  const formattedUpdatedTime = useMemo(
    () => (note.contentUpdatedAt ? fromNow(note.contentUpdatedAt) : ""),
    [note.contentUpdatedAt],
  );

  // Memoize published date formatting
  const formattedPublishedTime = useMemo(
    () => (note.publishedAt ? `published ${fromNow(note.publishedAt)}` : ""),
    [note.publishedAt],
  );

  // Memoize isFocused calculation
  const isFocused = useMemo(
    () => appFocus?.panel === "feed" && appFocus.isFocused && active,
    [appFocus, active],
  );

  // Memoize event handlers with useCallback
  const handleSetActiveNote = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      setActiveNoteId(note._id);
      setAppFocus({ panel: "feed", isFocused: true });
      // void queryClient.invalidateQueries({ queryKey: ["note"] });
    },
    [note._id, setActiveNoteId, setAppFocus],
  );

  const handleContextMenu = useCallback(
    async (_: React.MouseEvent<HTMLDivElement>) => {
      if (feedType === "all" || feedType === "notebook") {
        const notebooks = await window.api.getNotebooks(true);
        console.log("notebooks test", notebooks);
        window.api.noteCardContextMenu(note, notebooks);
      }
      if (feedType === "trash") {
        window.api.trashNoteCardContextMenu(note._id);
      }
    },
    [feedType, note],
  );

  return (
    <div className="mx-3 flex w-full flex-col items-center">
      <button
        data-focused={isFocused}
        className={cn(
          "relative flex w-full cursor-default flex-col items-start gap-2 rounded-md p-2.5 text-left text-sm",
          active && "bg-accent/50 data-[focused=true]:bg-primary/30",
        )}
      >
        <div
          className="flex w-full flex-col gap-1"
          onContextMenu={handleContextMenu}
          onClick={handleSetActiveNote}
        >
          <div className="flex w-full flex-col gap-1.5">
            {noteSearch ? (
              <Highlighter
                className="line-clamp-1 truncate font-semibold break-all text-ellipsis whitespace-break-spaces select-none"
                highlightClassName="bg-yellow-300 text-background"
                searchWords={[noteSearch]}
                autoEscape={true}
                textToHighlight={note.title}
              />
            ) : (
              <h2 className="text-secondary-foreground line-clamp-1 truncate font-semibold break-all text-ellipsis whitespace-break-spaces select-none">
                {note.title}
              </h2>
            )}

            {noteSearch ? (
              <Highlighter
                className="text-muted-foreground/80 line-clamp-2 min-h-[3em] pt-0 break-all whitespace-break-spaces select-none"
                highlightClassName="bg-yellow-300 text-background"
                searchWords={[noteSearch]}
                autoEscape={true}
                // caseSensitive={true}
                textToHighlight={parsedContentWithSearch}
              />
            ) : (
              <div
                data-focused={isFocused}
                className="text-muted-foreground data-[focused=true]:text-secondary-foreground mt-0 line-clamp-2 min-h-[3em] pt-0 break-all text-ellipsis whitespace-break-spaces"
              >
                {note.previewContent}
              </div>
            )}

            <div className="flex w-full items-center justify-between">
              <span
                data-focused={isFocused}
                className="text-muted-foreground/80 data-[focused=true]:text-secondary-foreground text-xs select-none"
              >
                {formattedUpdatedTime}
              </span>
              {note.publishedAt && (
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild className="cursor-default">
                    <span
                      data-focused={isFocused}
                      className="data-[focused=true]:text-secondary-foreground text-primary/80 cursor-default text-xs select-none"
                    >
                      <SendIcon className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <span>{formattedPublishedTime}</span>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
        {/* {note.Active && isDataActive && (
          <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500"></div>
        )} */}
      </button>
      <div className="flex w-full flex-col items-center px-[0.30rem]">
        {index < length - 1 && (
          <Separator decorative className="bg-accent/30" />
        )}
      </div>
    </div>
  );
}

// Export memoized component
export const NoteCard = React.memo(NoteCardBase);
