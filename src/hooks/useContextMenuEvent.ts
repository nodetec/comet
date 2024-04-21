import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useGlobalState } from "~/store";
import { type ContextMenuEventPayload } from "~/types";

export const useContextMenuEvent = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const setAppContext = useGlobalState.getState().setAppContext;

    void listen("menu_event", (e) => {
      const appContext = useGlobalState.getState().appContext;
      const payload = e.payload as ContextMenuEventPayload;

      switch (payload.eventKind) {
        case "trash_note":
          if (payload.id === appContext.currentNote?.id) {
            setAppContext({
              ...appContext,
              currentTrashedNote: undefined,
            });
          }
          void queryClient.invalidateQueries({ queryKey: ["notes"] });
          break;
        case "delete_tag":
          if (payload.id === appContext.activeTag?.id) {
            setAppContext({
              ...appContext,
              activeTag: undefined,
            });
          }
          void queryClient.invalidateQueries({ queryKey: ["tags"] });
          break;
        default:
          break;
      }
    });
  }, []);
};
