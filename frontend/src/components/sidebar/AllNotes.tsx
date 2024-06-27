import { NotepadText } from "lucide-react";

export default function AllNotes() {
  const activeTag = undefined;
  const filter = "all";

  return (
    <div
      className={`flex cursor-pointer rounded-md p-2 text-sm font-medium text-muted-foreground ${filter === "all" && activeTag === undefined && "bg-muted"}`}
    >
      <NotepadText className="h-[1.2rem] w-[1.2rem]" />
      <span className="ml-1">All Notes</span>
    </div>
  );
}
