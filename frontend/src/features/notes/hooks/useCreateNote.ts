import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

async function createNote() {
  const title = dayjs().format("YYYY-MM-DD");

  // await AppService.CreateNote(title, "");
}

export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createNote,
    onSuccess: (_) => {
      void queryClient.invalidateQueries({
        queryKey: ["notes"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["activeNote"],
      });
    },
  });
}
