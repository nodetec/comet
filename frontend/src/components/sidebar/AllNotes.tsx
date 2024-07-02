import { NotepadText } from "lucide-react";

export default function AllNotes() {
  return (
    <span
      className={`flex cursor-pointer rounded-md text-sm font-medium text-muted-foreground}`}
    >
      <NotepadText className="h-[1.2rem] w-[1.2rem]" />
      <span className="ml-1">All Notes</span>
    </span>
  );
}
