import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";
import dayjs from "dayjs";

async function createNote() {
  const title = dayjs().format("YYYY-MM-DD");

  const note = await AppService.CreateNote(title, "");

  return note;
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
