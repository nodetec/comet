import { MagnifyingGlassIcon } from "@radix-ui/react-icons";

import { Input } from "../ui/input";
import { useGlobalState } from "~/store";
import { useQueryClient } from "@tanstack/react-query";

export default function SearchNotes() {
  const { setNoteSearch } = useGlobalState()
  const queryClient = useQueryClient()

  const handleSetSearchNote = async (
    e: any,
  ) => {
    e.preventDefault();
    const searchValue = e.target.value;
    setNoteSearch(searchValue)
    await queryClient.invalidateQueries({ queryKey: ["notes"] })
  };

  return (
    <div className="flex items-center py-2 pr-4">
      <MagnifyingGlassIcon className="pointer-events-none relative left-8 top-2.5 h-[1.2rem] w-[1.2rem] -translate-y-1/2 transform text-muted-foreground" />
      <Input
        placeholder="Search..."
        className="pl-10 focus-visible:ring-muted-foreground/30"
        onChange={handleSetSearchNote}
      />
    </div>
  );
}
