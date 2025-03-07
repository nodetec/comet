import { useQuery, type QueryFunctionContext } from "@tanstack/react-query";
import { type Tag } from "&/comet/backend/models/models";
import { AppService } from "&/comet/backend/service";

type QueryKey = [string, number | undefined];

async function fetchNoteTags({ queryKey }: QueryFunctionContext<QueryKey>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, noteId] = queryKey;
  if (!noteId) {
    return null;
  }
  try {
    const tags = (await AppService.GetTagsByNoteID(noteId)) as Tag[];
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
