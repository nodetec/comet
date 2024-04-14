import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useGlobalState } from "~/store";
import { type ContextMenuEventPayload } from "~/types";

export const useContextMenuEvent = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const setActiveNote = useGlobalState.getState().setActiveNote;
    const setActiveTag = useGlobalState.getState().setActiveTag;

    void listen("menu_event", (e) => {
      const activeNote = useGlobalState.getState().activeNote;
      const activeTag = useGlobalState.getState().activeTag;
      const payload = e.payload as ContextMenuEventPayload;

      switch (payload.eventKind) {
        case "delete_note":
          if (payload.id === activeNote?.id) {
            setActiveNote(undefined);
          }
          void queryClient.invalidateQueries({ queryKey: ["notes"] });
          break;
        case "delete_tag":
          console.log("delete_tag", payload.id, activeTag?.id);
          if (payload.id === activeTag?.id) {
            setActiveTag(undefined);
          }
          void queryClient.invalidateQueries({ queryKey: ["tags"] });
          break;
        default:
          break;
      }
    });
  }, []);
};
