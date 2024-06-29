import { Note } from "&/github.com/nodetec/captains-log/db/models";
import { parseContent } from "~/lib/markdown";
import { fromNow } from "~/lib/utils";
import { useAppState } from "~/store";

import { Separator } from "../ui/separator";

type Props = {
  note: Note;
};

export default function NoteCard({ note }: Props) {
  const { activeNote, setActiveNote } = useAppState();

  function handleSetActiveNote(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    setActiveNote(note);
  }

  return (
    <div className="mx-3">
      <div
        key={note.ID}
        onClick={handleSetActiveNote}
        className={`flex h-full w-full cursor-pointer select-none flex-col gap-y-1 rounded-md px-2 pb-3 pt-3 text-sm ${activeNote?.ID === note.ID && "bg-muted/80"}`}
      >
        <h2 className="select-none font-semibold text-primary">{note.Title}</h2>
        <span className="select-none pb-6 text-muted-foreground">
          {parseContent(note.Content)}
        </span>

        <span className="select-none text-xs text-muted-foreground/80">
          {note.ModifiedAt && fromNow(note.ModifiedAt)}
        </span>
        <h2 className="select-none font-semibold text-muted-foreground">
          {note.ID}
        </h2>
      </div>
      <div className="px-[0.30rem]">
        <Separator className="bg-border/30" />
      </div>
    </div>
  );
}
