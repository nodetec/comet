import { createContextMenu } from "~/api";
import { fromNow } from "~/lib/utils";
import { useGlobalState } from "~/store";
import { type Note } from "~/types";

type Props = {
  note: Note;
};

export default function NoteCard({ note }: Props) {
  const { activeNote, setActiveNote } = useGlobalState();

  const handleSetActiveNote = (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    setActiveNote(note);
  };

  const handleContextMenu = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault(); // prevent the default behaviour when right clicked
    console.log("Right Click");
    const id = note.id;
    await createContextMenu({ menuKind: "NoteItem", id });
  };

  const parseTitle = (content: string) => {
    const firstLine = content.split("\n")[0];
    if (firstLine.length === 0) {
      return "New Note";
    }
    return firstLine;
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      onClick={handleSetActiveNote}
      key={note.id}
      className={`flex h-full w-full cursor-pointer select-none flex-col gap-y-1 rounded-md p-2 text-sm ${activeNote?.id === note.id && "bg-muted/80"}`}
    >
      <h2 className="select-none font-semibold text-primary">
        {parseTitle(note.content)}
      </h2>
      <span className="select-none text-muted-foreground">
        {note.content || "No Content"}
      </span>
      <span className="select-none text-xs text-muted-foreground/80">
        {fromNow(note.createdAt)}
      </span>
    </div>
  );
}
