import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useAppContext } from "~/store";
import {
  type ContextMenuEventPayload,
  type NoteItemContextMenuEventPayload,
  type NoteTagItemContextMenuEventPayload,
  type TagItemContextMenuEventPayload,
} from "~/types/contextMenuTypes";

export const useContextMenuEvent = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const app = useAppContext.getState();

    void listen("menu_event", (e) => {
      const payload = e.payload as ContextMenuEventPayload;
      const contextMenuEventKind = payload.contextMenuEventKind;
      const eventKey = Object.keys(contextMenuEventKind)[0];
      switch (eventKey) {
        case "NoteItem":
          const noteItemContextMenuEventPayload =
            contextMenuEventKind as NoteItemContextMenuEventPayload;
          const noteItemEvent = noteItemContextMenuEventPayload.NoteItem;
          switch (noteItemEvent.eventKind) {
            case "trash_note":
              if (noteItemEvent.id === app.currentNote?.id) {
                app.setCurrentNote(undefined);
              }
              void queryClient.invalidateQueries({ queryKey: ["notes"] });
              break;
            default:
              break;
          }
          break;
        case "TagItem":
          const tagItemContextMenuEventPayload =
            contextMenuEventKind as TagItemContextMenuEventPayload;
          const tagItemEvent = tagItemContextMenuEventPayload.TagItem;
          switch (tagItemEvent.eventKind) {
            case "delete_tag":
              if (tagItemEvent.id === app.activeTag?.id) {
                app.setActiveTag(undefined);
              }
              void queryClient.invalidateQueries({ queryKey: ["tags"] });
              break;
            default:
              break;
          }
          break;

        case "NoteTag":
          const noteTagItemContextMenuEventPayload =
            contextMenuEventKind as NoteTagItemContextMenuEventPayload;
          const noteTagItemEvent = noteTagItemContextMenuEventPayload.NoteTag;
          switch (noteTagItemEvent.eventKind) {
            case "untag_note":
              const { tagId } = noteTagItemEvent;
              const filteredItems = app.currentNote?.tags.filter(
                (tag) => !(tag.id === tagId),
              );
              if (app.currentNote?.tags && filteredItems) {
                app.currentNote.tags = filteredItems;
                app.setCurrentNote({
                  ...app.currentNote,
                });
              }
              break;
            default:
              break;
          }
          break;
        default:
          break;
      }
    });
  }, []);
};
