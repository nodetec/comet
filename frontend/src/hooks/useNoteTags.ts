import { useQuery, type QueryFunctionContext } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";

type QueryKey = [string, number | undefined];

async function fetchNoteTags({ queryKey }: QueryFunctionContext<QueryKey>) {
  const [_, noteId] = queryKey;
  if (!noteId) {
    return null;
  }
  try {
    const tags = await AppService.GetTagsByNoteID(noteId);
    return tags;
  } catch (e) {
    console.error("Error fetching tags for note:", e);
    return null;
  }
}

export const useNoteTags = (noteId: number | undefined) => {
  return useQuery({
    queryKey: ["noteTags", noteId],
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    queryFn: fetchNoteTags,
  });
};
