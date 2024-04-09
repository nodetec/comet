import { useQueryClient } from "@tanstack/react-query";
import { createNote, tagNote, updateNote } from "~/api";
import { useGlobalState } from "~/store";
import { type ActiveNote } from "~/types";
import { SaveIcon, SendIcon, TagIcon } from "lucide-react";

import { Button } from "../ui/button";

export default function EditorControls() {
  const { setActiveNote, activeNote } = useGlobalState();
  const queryClient = useQueryClient();
  async function handleSaveNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
    const title = activeNote?.title;
    const content = activeNote?.content;
    const id = activeNote?.id;
    if (id === -1) {
      if (title === undefined || content === undefined) {
        return;
      }
      const note = await createNote({ title, content });
      setActiveNote(note.data as ActiveNote);
    } else {
      if (id === undefined || title === undefined || content === undefined) {
        return;
      }
      const note = await updateNote({ id, title, content });
      setActiveNote(note.data as ActiveNote);
    }

    void queryClient.invalidateQueries({ queryKey: ["notes"] });
  }
  async function handleSetGreenTag(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();

    const noteId = activeNote?.id;
    if (noteId === undefined) {
      return;
    }
    const tagId = 2;
    await tagNote({ noteId, tagId });
  }
  async function handleSetBlueTag(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
  }
  async function handleSendNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
  }

  return (
    <div className="flex gap-x-4 p-8">
      <Button onClick={handleSaveNote} variant="outline" size="icon">
        <SaveIcon className="h-[2.2rem] w-[2.2rem]" />
      </Button>
      <Button onClick={handleSetGreenTag} variant="outline" size="icon">
        <TagIcon className="h-[2.2rem] w-[2.2rem] text-green-400" />
      </Button>
      <Button onClick={handleSetBlueTag} variant="outline" size="icon">
        <TagIcon className="h-[2.2rem] w-[2.2rem] text-blue-400" />
      </Button>
      <Button onClick={handleSendNote} variant="outline" size="icon">
        <SendIcon className="h-[2.2rem] w-[2.2rem]" />
      </Button>
    </div>
  );
}
