import { useQueryClient } from "@tanstack/react-query";
import { updateNote } from "~/api";
import { useGlobalState } from "~/store";
import { SaveIcon, SendIcon } from "lucide-react";

import { Button } from "../ui/button";

export default function EditorControls() {
  const { setAppContext, appContext } = useGlobalState();
  const queryClient = useQueryClient();
  async function handleSaveNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
    const content = appContext.currentNote?.content;
    const id = appContext.currentNote?.id;
    if (id === undefined || content === undefined) {
      return;
    }
    const apiResponse = await updateNote({ id, content });
    setAppContext({
      ...appContext,
      currentNote: apiResponse.data,
      currentTrashedNote: undefined,
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
