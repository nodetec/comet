import { useQueryClient } from "@tanstack/react-query";
import { updateNote } from "~/api";
import { useGlobalState } from "~/store";
import { Note } from "~/types";
import { SaveIcon, SendIcon } from "lucide-react";

import { Button } from "../ui/button";

export default function EditorControls() {
  const { setActiveNote, activeNote } = useGlobalState();
  const queryClient = useQueryClient();
  async function handleSaveNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
    const content = activeNote.note?.content;
    const id = activeNote.note?.id;
    if (id === undefined || content === undefined) {
      return;
    }
    const apiResponse = await updateNote({ id, content });
    setActiveNote({
      context: activeNote.context,
      note: apiResponse.data as Note,
      tag: activeNote.tag,
      archivedNote: undefined,
    });

    void queryClient.invalidateQueries({ queryKey: ["notes"] });
  }
  async function handleSendNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
  }

  return (
    <div className="flex gap-y-2 p-4">
      <Button onClick={handleSaveNote} variant="outline" size="icon">
        <SaveIcon className="h-[1.2rem] w-[1.2rem]" />
      </Button>
      <Button onClick={handleSendNote} variant="outline" size="icon">
        <SendIcon className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    </div>
  );
}
