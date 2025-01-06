import { useQueryClient } from "@tanstack/react-query";
import { type Note } from "&/comet/backend/models/models";
import { AppService } from "&/comet/backend/service";
import { Separator } from "~/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { parseContent } from "~/lib/markdown";
import { cn, fromNow } from "~/lib/utils";
import { useAppState } from "~/store";
import { SendIcon } from "lucide-react";

type Props = {
  note: Note;
  index: number;
  length: number;
};

export function NoteCard({ note, index, length }: Props) {
  const queryClient = useQueryClient();

  const feedType = useAppState((state) => state.feedType);
  const setActiveNote = useAppState((state) => state.setActiveNote);
  const activeNote = useAppState((state) => state.activeNote);

  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);

  async function handleSetActiveNote(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    if (note.Active) {
      setActiveNote(note);
      setAppFocus({ panel: "feed", isFocused: true });
      return;
    }
    setActiveNote(note);
    await AppService.SetActiveNote(note.ID);
    await queryClient.invalidateQueries({ queryKey: ["activeNote"] });
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
    setAppFocus({ panel: "feed", isFocused: true });
  }

  const isDataActive =
    appFocus?.panel === "feed" && appFocus.isFocused && note.Active;

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    console.log("Right Clicked");
  };
  return (
    <div className="mx-3 flex w-full flex-col items-center">
      <button
        data-active={isDataActive}
        className={cn(
          "relative flex w-full cursor-default flex-col items-start gap-2 rounded-md p-2.5 text-left text-sm",
          note.Active && "bg-muted/70 data-[active=true]:bg-blue-500/50",
        )}
      >
        <div
          className="flex w-full flex-col gap-1"
          onContextMenu={handleContextMenu}
          onClick={handleSetActiveNote}
          style={
            feedType === "trash"
              ? ({
                  "--custom-contextmenu": "trash_note_card",
                  "--custom-contextmenu-data": `${JSON.stringify(note)}`,
                } as React.CSSProperties)
              : ({
                  "--custom-contextmenu": "note_card",
                  "--custom-contextmenu-data": `${JSON.stringify(note)}`,
                } as React.CSSProperties)
          }
        >
          <div className="flex w-full flex-col gap-1.5">
            <h2 className="line-clamp-1 select-none truncate text-ellipsis whitespace-break-spaces break-all font-semibold text-secondary-foreground">
              {note.Title}
            </h2>
            <div
              data-active={isDataActive}
              className="mt-0 line-clamp-2 min-h-[3em] text-ellipsis whitespace-break-spaces break-all pt-0 text-muted-foreground data-[active=true]:text-secondary-foreground"
            >
              {parseContent(note.Content) || "No content \n "}
            </div>
            <div className="flex w-full items-center justify-between">
              <span
                data-active={isDataActive}
                className="select-none text-xs text-muted-foreground/80 data-[active=true]:text-secondary-foreground"
              >
                {note.ModifiedAt && fromNow(note.ModifiedAt)}
              </span>
              {note.PublishedAt && (
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild className="cursor-default">
                    <span
                      data-active={isDataActive}
                      className="cursor-default select-none text-xs text-blue-500/60 data-[active=true]:text-secondary-foreground"
                    >
                      <SendIcon className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <span>{`published ${fromNow(note.PublishedAt)}`}</span>
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
