import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppState } from "~/store";

type CreateNoteVars = {
  notebookId?: string;
  tags: string[];
};

export function useCreateNote() {
  const queryClient = useQueryClient();

  const setActiveNoteId = useAppState((state) => state.setActiveNoteId);

  async function createNote(vars: CreateNoteVars) {
    const id = await window.api.createNote({
      notebookId: vars.notebookId,
      tags: vars.tags,
    });

    void queryClient.invalidateQueries({
      queryKey: ["notes"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["note"],
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
