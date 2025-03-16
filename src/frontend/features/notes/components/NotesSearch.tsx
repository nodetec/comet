import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";

export function NotesSearch() {
  //   const noteSearch = useAppState((state) => state.noteSearch);
  //   const setNoteSearch = useAppState((state) => state.setNoteSearch);
  //   const setSearchActive = useAppState((state) => state.setSearchActive);

  async function handleSetSearchNote(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value === "") {
      // setNoteSearch("");
      // setSearchActive(false);
      void window.api.searchNotes(e.target.value, 10, 0);
      return;
    }
    const results = await window.api.searchNotes(e.target.value, 10, 0);
    console.log("search results", results);
    // setSearchActive(true);
    // setNoteSearch(e.target.value);
  }

  return (
    <div className="flex items-center px-3 pt-2 pb-4 select-none">
      <Input
        placeholder="Search..."
        className="text-muted-foreground/80 placeholder:text-muted-foreground/60 h-8 bg-transparent select-none focus-visible:ring-blue-400/80"
        onChange={handleSetSearchNote}
        // value={noteSearch}
      />
    </div>
  );
}
