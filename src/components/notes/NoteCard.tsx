import { fromNow } from "~/lib/utils";
import { useGlobalState } from "~/store";
import { type Note } from "~/types";

type Props = {
  note: Note;
};

export default function NoteCard({ note }: Props) {

  const { setActiveNote } = useGlobalState();

  const handleSetActiveNote = (e: any) => {
    e.preventDefault()
    setActiveNote(note)
  }

  return (
    <div
      onClick={handleSetActiveNote}
      key={note.id}
      className="flex h-full w-full cursor-pointer select-none flex-col gap-y-1 rounded-md p-2 text-sm hover:bg-muted/80"
    >
      <h2 className="select-none font-semibold text-primary">
        {note.title}
      </h2>
      <span className="select-none text-muted-foreground">
        {note.content}
      </span>
      <span className="select-none text-xs text-muted-foreground/80">
        {fromNow(note.createdAt)}
      </span>
    </div>
  );
}
