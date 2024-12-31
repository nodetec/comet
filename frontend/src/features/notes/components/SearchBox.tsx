import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";

export function SearchBox() {
  const noteSearch = useAppState((state) => state.noteSearch);
  const setNoteSearch = useAppState((state) => state.setNoteSearch);
  const setSearchActive = useAppState((state) => state.setSearchActive);

  function handleSetSearchNote(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value === "") {
      setNoteSearch("");
      setSearchActive(false);
      return;
    }
    setSearchActive(true);
    setNoteSearch(e.target.value);
  }

  return (
    <div className="flex items-center px-3 pb-4 pt-2 select-none">
      <Input
        placeholder="Search..."
        className="h-8 text-muted-foreground/80 bg-transparent placeholder:text-muted-foreground/60 select-none focus-visible:ring-sky-500/90"
        onChange={handleSetSearchNote}
        value={noteSearch}
      />
    </div>
  );
}
