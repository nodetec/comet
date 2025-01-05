import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Events } from "@wailsio/runtime";
import { useAppState } from "~/store";
import { type WailsEvent } from "node_modules/@wailsio/runtime/types/events";

const useNotebookEvents = () => {
  const queryClient = useQueryClient();

  const setFeedType = useAppState((state) => state.setFeedType);
  const setActiveNotebook = useAppState((state) => state.setActiveNotebook);

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: ["notes"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["tags"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["notebooks", true],
      });
    };

    const onNotebookDeleted = (_: WailsEvent) => {
      refresh();
    };

    const onActiveNotebookDeleted = (_: WailsEvent) => {
      setFeedType("all");
      setActiveNotebook(undefined);
      refresh();
    };

    Events.On("notebook_deleted", onNotebookDeleted);
    Events.On("active_notebook_deleted", onActiveNotebookDeleted);
    Events.On("notebook_hidden", refresh);

    return () => {
      Events.Off("notebook_deleted");
      Events.Off("active_notebook_deleted");
    };
  }, [queryClient, setActiveNotebook, setFeedType]);
};

export default useNotebookEvents;
