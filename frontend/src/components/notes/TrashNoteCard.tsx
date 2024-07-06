import { Trash } from "&/github.com/nodetec/captains-log/db/models";
import { parseContent } from "~/lib/markdown";
import { cn, fromNow } from "~/lib/utils";
import { useAppState } from "~/store";

import { Separator } from "../ui/separator";

type Props = {
  trashNote: Trash;
};

export default function TrashNoteCard({ trashNote }: Props) {
  const { activeTrashNote, setActiveTrashNote } = useAppState();

  function handleSetActiveNote(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    setActiveTrashNote(trashNote);
  }

  return (
    <div className="mx-3 flex w-full flex-col items-center">
      <button
        className={cn(
          "flex w-full flex-col items-start gap-2 rounded-md p-2.5 text-left text-sm transition-all",
          activeTrashNote?.ID === trashNote.ID && "bg-muted/80",
        )}
      >
        <div
          onClick={handleSetActiveNote}
          className="flex w-full flex-col gap-1"
          style={
            {
              "--custom-contextmenu": "trashNoteMenu",
              "--custom-contextmenu-data": `${trashNote.ID}`,
            } as React.CSSProperties
          }
        >
          <div className="flex w-full flex-col gap-1.5">
            <h2 className="select-none truncate line-clamp-1 break-all whitespace-break-spaces text-ellipsis font-semibold text-primary">
              {trashNote.Title}
            </h2>
            <div className="mt-0 line-clamp-2 text-ellipsis whitespace-break-spaces break-all pt-0 text-muted-foreground">
              {parseContent(trashNote.Content) || "No content \n "}
            </div>
            <span className="select-none text-xs text-muted-foreground/80">
              {trashNote.ModifiedAt && fromNow(trashNote.ModifiedAt)}
            </span>
          </div>
        </div>
      </button>
      <div className="flex w-full flex-col items-center px-[0.30rem]">
        <Separator decorative className="bg-border/30" />
      </div>
    </div>
  );
}
