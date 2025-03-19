import { useQuery } from "@tanstack/react-query";
import { useAppState } from "~/store";
import { type Note } from "$/types/Note";

async function getNote(id: string | undefined): Promise<Note | null> {
  console.log("getNote", id);
  if (!id) return null;
  const note = await window.api.getNote(id);
  console.log("getNote", note);
  return note;
}

export const useNote = () => {
  const activeNoteId = useAppState((state) => state.activeNoteId);
  return useQuery<Note | null>({
    queryKey: ["note", activeNoteId],
    refetchOnWindowFocus: false,
    gcTime: 0,
    staleTime: 0,
    // TODO: why doesn't this work for individual notes?
    // placeholderData: keepPreviousData,
    queryFn: () => getNote(activeNoteId),
  });
};
