import { useQuery } from "@tanstack/react-query";
import { type Note } from "$/types/Note";

async function getNote(id: string | undefined): Promise<Note | null> {
  if (!id) return null;
  return await window.api.getNote(id);
}

export const useNote = (id: string | undefined) => {
  return useQuery<Note | null>({
    queryKey: ["note", id],
    refetchOnWindowFocus: false,
    gcTime: 0,
    staleTime: 0,
    queryFn: () => getNote(id),
  });
};
