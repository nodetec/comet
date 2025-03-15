import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppState } from "~/store";

export function useCreateNote() {
  const queryClient = useQueryClient();

  const setActiveNoteId = useAppState((state) => state.setActiveNoteId);

  async function createNote(notebookId?: string) {
    console.log("Creating note in notebook:", notebookId);

    const id = await window.api.createNote({
      notebookId,
      tags: [],
    });

    void queryClient.invalidateQueries({
      queryKey: ["notes"],
    });

    setActiveNoteId(id);
  }

  return useMutation({
    mutationFn: createNote,
    onSuccess: (_) => {
      //   void queryClient.invalidateQueries({
      //     queryKey: ["notes"],
      //   });
    },
  });
}
