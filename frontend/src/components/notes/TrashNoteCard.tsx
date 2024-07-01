import { Trash } from "&/github.com/nodetec/captains-log/db/models";
import { parseContent } from "~/lib/markdown";
import { fromNow } from "~/lib/utils";
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
    <div className="mx-3">
      <div
        key={trashNote.ID}
        onClick={handleSetActiveNote}
        style={
          {
            "--custom-contextmenu": "trashNoteMenu",
            "--custom-contextmenu-data": `${trashNote.ID}`,
          } as React.CSSProperties
        }
        className={`flex h-full w-full cursor-pointer select-none flex-col gap-y-1 rounded-md px-2 pb-3 pt-3 text-sm ${activeTrashNote?.ID === trashNote.ID && "bg-muted/80"}`}
      >
        <h2 className="select-none font-semibold text-primary">{trashNote.Title}</h2>
        <span className="select-none pb-6 text-muted-foreground">
          {parseContent(trashNote.Content)}
        </span>

        <span className="select-none text-xs text-muted-foreground/80">
          {trashNote.TrashedAt && fromNow(trashNote.TrashedAt)}
        </span>
      </div>
      <div className="px-[0.30rem]">
        <Separator className="bg-border/30" />
      </div>
    </div>
  );
}
