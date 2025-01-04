import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Events } from "@wailsio/runtime";
import { type WailsEvent } from "node_modules/@wailsio/runtime/types/events";

const useNoteEvents = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = (_: WailsEvent) => {
      console.log("refreshing notes");
      void queryClient.invalidateQueries({
        queryKey: ["notes"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["tags"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["activeNote"],
      });
    };
    Events.On("note_trashed", refresh);
    Events.On("note_restored", refresh);
    Events.On("note_deleted", refresh);

    return () => {
      Events.Off("note_trashed");
      Events.Off("note_restored");
      Events.Off("note_deleted");
    };
  }, [queryClient]);
};

export default useNoteEvents;
