import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";

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

  return (
    <div className="flex items-center px-3 pt-2 pb-4 select-none">
      <Input
        placeholder="Search..."
        className="text-muted-accent/80 placeholder:text-accent-foreground/60 focus-visible:ring-primary h-8 shrink-0 bg-transparent select-none"
        onChange={handleSetSearchNote}
        value={noteSearch}
        onFocus={handleFocus}
      />
    </div>
  );
}
