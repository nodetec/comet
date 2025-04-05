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
    <div className="flex select-none items-center pb-4 mx-2">
      <div className="relative w-full">
        <Input
          placeholder="Search..."
          className="h-8 select-none bg-transparent pr-8 text-muted-accent/80 text-sm placeholder:text-accent-foreground/60 focus-visible:ring-primary"
          onChange={handleSetSearchNote}
          value={noteSearch}
          onFocus={handleFocus}
        />
        {noteSearch && (
          <button
            type="button"
            onClick={clearSearch}
            className="-translate-y-1/2 absolute top-1/2 right-2 transform text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
