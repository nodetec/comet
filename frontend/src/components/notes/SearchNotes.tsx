import { Input } from "../ui/input";

export default function SearchNotes() {
  return (
    <div className="flex items-center px-3 pb-4 pt-2">
      <Input
        placeholder="Search..."
        className="text-muted-foreground/80 placeholder:text-muted-foreground/60 focus-visible:ring-muted-foreground/30"
        // onChange={handleSetSearchNote}
        // value={noteSearch}
      />
    </div>
  );
}
