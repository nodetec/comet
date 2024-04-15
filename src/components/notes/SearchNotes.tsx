import { useQueryClient } from "@tanstack/react-query";
import { useGlobalState } from "~/store";

import { Input } from "../ui/input";

export default function SearchNotes() {
  const { setNoteSearch } = useGlobalState();
  const queryClient = useQueryClient();

  const handleSetSearchNote = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    const searchValue = e.target.value;
    setNoteSearch(searchValue);
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  return (
    <div className="flex items-center px-3 py-2">
      <Input
        placeholder="Search..."
        className="text-muted-foreground/80 placeholder:text-muted-foreground/60 focus-visible:ring-muted-foreground/30"
        onChange={handleSetSearchNote}
      />
    </div>
  );
}
