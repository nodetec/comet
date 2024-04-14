import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useGlobalState } from "~/store";
import { type ContextMenuEventPayload } from "~/types";

export const useContextMenuEvent = () => {
  const { activeNote, setActiveNote } = useGlobalState();

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!activeNote) {
      return;
    }

    void listen("menu_event", (e) => {
      const payload = e.payload as ContextMenuEventPayload;

      switch (payload.eventKind) {
        case "delete_note":
          if (payload.id === activeNote?.id) {
            setActiveNote(undefined);
          }
          void queryClient.invalidateQueries({ queryKey: ["notes"] });
          break;
        default:
          break;
      }
    });
  }, [activeNote, queryClient, setActiveNote]);
};
