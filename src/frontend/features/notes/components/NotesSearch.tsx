import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";
import { X } from "lucide-react"; // Import X icon

export function NotesSearch() {
  const noteSearch = useAppState((state) => state.noteSearch);
  const setNoteSearch = useAppState((state) => state.setNoteSearch);

  const setAppFocus = useAppState((state) => state.setAppFocus);

  async function handleSetSearchNote(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value === "") {
      setNoteSearch("");
      return;
    }
    setNoteSearch(e.target.value);
  }

  const handleFocus = () => {
    console.log("focus");
    setAppFocus({ panel: undefined, isFocused: true });
  };

  const clearSearch = () => {
    setNoteSearch("");
  };

  return (
    <div className="mr-[5px] flex items-center px-1 pt-2 pb-4 select-none">
      <div className="relative w-full">
        <Input
          placeholder="Search..."
          className="text-muted-accent/80 placeholder:text-accent-foreground/60 focus-visible:ring-primary h-8 bg-transparent pr-8 text-sm select-none"
          onChange={handleSetSearchNote}
          value={noteSearch}
          onFocus={handleFocus}
        />
        {noteSearch && (
          <button
            onClick={clearSearch}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transform"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
