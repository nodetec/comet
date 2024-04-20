import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useGlobalState } from "~/store";
import { type ContextMenuEventPayload } from "~/types";

export const useContextMenuEvent = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const setActiveNote = useGlobalState.getState().setActiveNote;

    void listen("menu_event", (e) => {
      const activeNote = useGlobalState.getState().activeNote;
      const payload = e.payload as ContextMenuEventPayload;

      switch (payload.eventKind) {
        case "archive_note":
          if (payload.id === activeNote.note?.id) {
            activeNote.note = undefined;
            setActiveNote(activeNote);
          }
          void queryClient.invalidateQueries({ queryKey: ["notes"] });
          break;
        case "delete_tag":
          if (payload.id === activeNote.tag?.id) {
            activeNote.tag = undefined;
            setActiveNote(activeNote);
          }
          void queryClient.invalidateQueries({ queryKey: ["tags"] });
          break;
        default:
          break;
      }
    });
  }, []);
};
