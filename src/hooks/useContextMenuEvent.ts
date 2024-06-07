import { useEffect, useState } from "react";

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
  const { currentNote, setCurrentNote, activeTag, setActiveTag } =
    useAppContext();
  const [unlisten, setUnlisten] = useState<() => void>(() => () => {});

  async function listenHandler() {
    const app = useAppContext.getState();

    const unlisten = await listen("menu_event", (e) => {
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
              if (noteItemEvent.id === currentNote?.id) {
                setCurrentNote(undefined);
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
              if (tagItemEvent.id === activeTag?.id) {
                setActiveTag(undefined);
              }
              const filteredTags = currentNote?.tags.filter(
                (tag) => tag.id !== tagItemEvent.id,
              );

              if (currentNote?.tags && filteredTags) {
                setCurrentNote({
                  ...currentNote,
                  tags: filteredTags,
                });
              } else {
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

              const filteredTags = currentNote?.tags.filter(
                (tag) => !(tag.id === tagId),
              );

              if (tagId === activeTag?.id) {
                void queryClient.invalidateQueries({ queryKey: ["notes"] });
              }

              if (currentNote?.tags && filteredTags) {
                if (currentNote) {
                  app.setCurrentNote({ ...currentNote, tags: filteredTags });
                }
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
    setUnlisten(() => unlisten);
  }

  useEffect(() => {
    if (unlisten) {
      unlisten();
    }
    void listenHandler();
  }, [currentNote, activeTag]);
};
