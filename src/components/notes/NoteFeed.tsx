import { useQuery } from "@tanstack/react-query";
import { listNotes } from "~/api";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useGlobalState } from "~/store";

import NoteCard from "./NoteCard";

export default function NoteFeed() {
  async function fetchNotes() {
    const activeTag = useGlobalState.getState().activeTag
    const search = useGlobalState.getState().noteSearch
    const tagId = activeTag?.id
    const apiResponse = await listNotes({ tagId, search })
    if (!apiResponse.data) {
      throw new Error("Data not found!")
    }
    return apiResponse.data;
  }

  const { data } = useQuery({
    queryKey: ["notes"],
    queryFn: fetchNotes,
  });

  return (
    <ScrollArea className="flex h-full flex-col px-2 pt-2 pb-12">
      {data?.map((note) => <NoteCard key={note.id} note={note} />)}
    </ScrollArea>
  );
}
