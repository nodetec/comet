import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";

export function NotesSearch() {
  //   const noteSearch = useAppState((state) => state.noteSearch);
  //   const setNoteSearch = useAppState((state) => state.setNoteSearch);
  const activeNotebookId = useAppState((state) => state.activeNotebookId);
  const activeTags = useAppState((state) => state.activeTags);

  function handleSetSearchNote(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value === "") {
      // setNoteSearch("");
      // setSearchActive(false);
      console.log("activeNotebookId", activeNotebookId);
      void window.api.searchDocuments(
        e.target.value,
        activeNotebookId,
        activeTags,
      );
      return;
    }
    console.log("activeNotebookId", activeNotebookId);
    void window.api.searchDocuments(
      e.target.value,
      activeNotebookId,
      activeTags,
    );
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
