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

type Props = {
  note: Note;
  index: number;
  length: number;
};

export function NoteCard({ note, index, length }: Props) {
  const activeNoteId = useAppState((state) => state.activeNoteId);
  const setActiveNoteId = useAppState((state) => state.setActiveNoteId);

  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);

  const feedType = useAppState((state) => state.feedType);

  const active = activeNoteId === note._id;

  async function handleSetActiveNote(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    setActiveNoteId(note._id);
    setAppFocus({ panel: "feed", isFocused: true });
  }

  const isFocused = appFocus?.panel === "feed" && appFocus.isFocused && active;

  const handleContextMenu = async (_: React.MouseEvent<HTMLDivElement>) => {
    if (feedType === "all" || feedType === "notebook") {
      const notebooks = await window.api.getNotebooks(true);
      console.log("notebooks test", notebooks);
      window.api.noteCardContextMenu(note, notebooks);
    }
    if (feedType === "trash") {
      window.api.trashNoteCardContextMenu(note._id);
    }
  };

  return (
    <div className="mx-3 flex w-full flex-col items-center">
      <button
        data-focused={isFocused}
        className={cn(
          "relative flex w-full cursor-default flex-col items-start gap-2 rounded-md p-2.5 text-left text-sm",
          active && "bg-accent/50 data-[focused=true]:bg-blue-500/50",
        )}
      >
        <div
          className="flex w-full flex-col gap-1"
          onContextMenu={handleContextMenu}
          onClick={handleSetActiveNote}
        >
          <div className="flex w-full flex-col gap-1.5">
            <h2 className="text-secondary-foreground line-clamp-1 truncate font-semibold break-all text-ellipsis whitespace-break-spaces select-none">
              {note.title}
            </h2>
            <div
              data-focused={isFocused}
              className="text-muted-foreground data-[focused=true]:text-secondary-foreground mt-0 line-clamp-2 min-h-[3em] pt-0 break-all text-ellipsis whitespace-break-spaces"
            >
              {parseContent(note.content) || "No content \n "}
            </div>
            <div className="flex w-full items-center justify-between">
              <span
                data-focused={isFocused}
                className="text-muted-foreground/80 data-[focused=true]:text-secondary-foreground text-xs select-none"
              >
                {note.contentUpdatedAt && fromNow(note.contentUpdatedAt)}
              </span>
              {note.publishedAt && (
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild className="cursor-default">
                    <span
                      data-focused={isFocused}
                      className="data-[focused=true]:text-secondary-foreground cursor-default text-xs text-blue-400/80 select-none"
                    >
                      <SendIcon className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <span>{`published ${fromNow(note.publishedAt)}`}</span>
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
        {index < length - 1 && <Separator decorative className="bg-muted/30" />}
      </div>
    </div>
  );
}
