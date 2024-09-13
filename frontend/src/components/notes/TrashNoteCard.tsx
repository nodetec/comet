import { Trash } from "&/github.com/nodetec/captains-log/db/models";
import { cn, fromNow } from "~/lib/utils";
import { useAppState } from "~/store";

import { Separator } from "../ui/separator";
import TrashNoteCardPreview from "./TrashNoteCardPreview";

type Props = {
  trashNote: Trash;
};

export default function TrashNoteCard({ trashNote }: Props) {
  const activeTrashNote = useAppState((state) => state.activeTrashNote);
  const setActiveTrashNote = useAppState((state) => state.setActiveTrashNote);

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
          className="flex w-full flex-col gap-1"
          onClick={handleSetActiveNote}
          style={
            {
              "--custom-contextmenu": "trashNoteMenu",
              "--custom-contextmenu-data": `${trashNote.ID}`,
            } as React.CSSProperties
          }
        >
          <div className="flex w-full flex-col gap-1.5">
            <h2 className="line-clamp-1 select-none truncate text-ellipsis whitespace-break-spaces break-all font-semibold text-primary">
              {trashNote.Title}
            </h2>
            <div className="mt-0 line-clamp-2 text-ellipsis whitespace-break-spaces break-all pt-0 text-muted-foreground">
              <TrashNoteCardPreview trashNote={trashNote} />
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
