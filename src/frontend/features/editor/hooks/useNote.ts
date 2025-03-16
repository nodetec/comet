import { useQuery } from "@tanstack/react-query";
import { type Note } from "$/types/Note";

async function getNote(id: string | undefined): Promise<Note | null> {
  console.log("getNote", id);
  if (!id) return null;
  const note = await window.api.getNote(id);
  console.log("getNote", note);
  return note;
}

export const useNote = (id: string | undefined) => {
  return useQuery<Note | null>({
    queryKey: ["note", id],
    refetchOnWindowFocus: false,
    // TODO: why doesn't this work for individual notes?
    // placeholderData: keepPreviousData,
    queryFn: () => getNote(id),
  });
};
