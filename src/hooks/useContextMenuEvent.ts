import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useAppContext } from "~/store";
import { type ContextMenuEventPayload } from "~/types";

export const useContextMenuEvent = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const app = useAppContext.getState();

    void listen("menu_event", (e) => {
      const payload = e.payload as ContextMenuEventPayload;

      switch (payload.eventKind) {
        case "trash_note":
          if (payload.id === app.currentNote?.id) {
            app.setCurrentNote(undefined);
          }
          void queryClient.invalidateQueries({ queryKey: ["notes"] });
          break;
        case "delete_tag":
          if (payload.id === app.activeTag?.id) {
            app.setActiveTag(undefined);
          }
          void queryClient.invalidateQueries({ queryKey: ["tags"] });
          break;
        default:
          break;
      }
    });
  }, []);
};
