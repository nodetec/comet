import { useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "~/store";

import { Input } from "../ui/input";

export default function SearchNotes() {
  const { noteSearch, setNoteSearch } = useAppContext();
  const queryClient = useQueryClient();

  const handleSetSearchNote = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    const searchValue = e.target.value;
    setNoteSearch(searchValue);
    await queryClient.invalidateQueries({
      queryKey: ["notes", { search: true }],
    });
  };

  return (
    <div className="flex items-center px-3 pt-2 pb-4">
      <Input
        placeholder="Search..."
        className="text-muted-foreground/80 placeholder:text-muted-foreground/60 focus-visible:ring-muted-foreground/30"
        onChange={handleSetSearchNote}
        value={noteSearch}
      />
    </div>
  );
}
