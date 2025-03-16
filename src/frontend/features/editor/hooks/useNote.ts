import { useQuery } from "@tanstack/react-query";
import { useAppState } from "~/store";
import { type Note } from "$/types/Note";

async function getNote(id: string | undefined): Promise<Note | null> {
  if (!id) return null;
  return await window.api.getNote(id);
}

export const useNote = (id: string | undefined) => {
  const activeNoteId = useAppState((state) => state.activeNoteId);
  return useQuery<Note | null>({
    queryKey: ["note", id],
    refetchOnWindowFocus: false,
    // TODO: why doesn't this work for individual notes?
    // placeholderData: keepPreviousData,
    queryFn: () => getNote(activeNoteId),
  });
};
