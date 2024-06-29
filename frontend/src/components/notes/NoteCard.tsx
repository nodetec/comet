// import { Separator } from "../ui/separator";

import { Note } from "&/github.com/nodetec/captains-log/db/models";
import { fromNow } from "~/lib/utils";

import { Separator } from "../ui/separator";

type Props = {
  note: Note;
};

export default function NoteCard({ note }: Props) {
  const currentNote = { id: 1 };

  return (
    <div className="mx-3">
      <div
        key={note.ID}
        className={`flex h-full w-full cursor-pointer select-none flex-col gap-y-1 rounded-md px-2 pb-3 pt-3 text-sm ${currentNote?.id === note.ID && "bg-muted/80"}`}
      >
        <h2 className="select-none font-semibold text-primary">{note.Title}</h2>
        <span className="select-none pb-6 text-muted-foreground">
          {note.Content}
        </span>

        <span className="select-none text-xs text-muted-foreground/80">
          {note.ModifiedAt && fromNow(note.ModifiedAt)}
        </span>
      </div>
      <div className="px-[0.30rem]">
        <Separator className="bg-border/30" />
      </div>
    </div>
  );
}
