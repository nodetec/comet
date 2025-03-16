import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";

export function NotesSearch() {
  const noteSearch = useAppState((state) => state.noteSearch);
  const setNoteSearch = useAppState((state) => state.setNoteSearch);

  async function handleSetSearchNote(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value === "") {
      setNoteSearch("");
      // void window.api.searchNotes(e.target.value, 10, 0);
      return;
    }
    // const results = await window.api.searchNotes(
    //   e.target.value,
    //   10,
    //   0,
    //   activeNotebookid,
    // );
    // console.log("search results", results);
    setNoteSearch(e.target.value);
  }

  return (
    <div className="flex items-center px-3 pt-2 pb-4 select-none">
      <Input
        placeholder="Search..."
        className="text-muted-accent/80 placeholder:text-accent-foreground/60 focus-visible:ring-primary h-8 bg-transparent select-none"
        onChange={handleSetSearchNote}
        value={noteSearch}
      />
    </div>
  );
}
