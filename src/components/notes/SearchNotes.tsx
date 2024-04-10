import { Input } from "../ui/input";
import { useGlobalState } from "~/store";
import { useQueryClient } from "@tanstack/react-query";

export default function SearchNotes() {
  const { setNoteSearch } = useGlobalState()
  const queryClient = useQueryClient()

  const handleSetSearchNote = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    e.preventDefault();
    const searchValue = e.target.value;
    setNoteSearch(searchValue)
    await queryClient.invalidateQueries({ queryKey: ["notes"] })
  };

  return (
    <div className="flex items-center py-2">
      <Input
        placeholder="Search..."
        className="focus-visible:ring-muted-foreground/30 text-muted-foreground/80 placeholder:text-muted-foreground/60"
        onChange={handleSetSearchNote}
      />
    </div>
  );
}
