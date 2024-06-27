// import { Separator } from "../ui/separator";

type Note = {
  id: string;
  title: string;
  content: string;
  trashedAt?: string;
  modifiedAt?: string;
};

type Props = {
  note: Note;
};

export default function NoteCard({ note }: Props) {
  const currentNote = { id: "1" };

  return (
    <div className="mx-3">
      <div
        key={note.id}
        className={`flex h-full w-full cursor-pointer select-none flex-col gap-y-1 rounded-md px-2 pb-3 pt-3 text-sm ${currentNote?.id === note.id && "bg-muted/80"}`}
      >
        <h2 className="select-none font-semibold text-primary">{note.title}</h2>
        <span className="select-none pb-6 text-muted-foreground">
          {note.content}
        </span>

        {/* <span className="select-none text-xs text-muted-foreground/80"> */}
        {/*   {note.trashedAt */}
        {/*     ? fromNow(note.trashedAt) */}
        {/*     : note.modifiedAt && fromNow(note.modifiedAt)} */}
        {/* </span> */}
      </div>
      <div className="px-[0.30rem]">{/* <Separator /> */}</div>
    </div>
  );
}
