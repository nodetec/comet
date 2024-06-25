import { useCallback, useEffect, useState } from "react";

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
  const [unlisten, setUnlisten] = useState<() => void | undefined>(
    () => undefined,
  );

  const listenHandler = useCallback(async () => {
    const unlisten = await listen("menu_event", (e) => {
      const payload = e.payload as ContextMenuEventPayload;
      const contextMenuEventKind = payload.contextMenuEventKind;
      const eventKey = Object.keys(contextMenuEventKind)[0];

      const app = useAppContext.getState();

      const handleNoteItemEvent = (
        noteItemEvent: NoteItemContextMenuEventPayload["NoteItem"],
      ) => {
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
      };

      const handleTagItemEvent = (
        tagItemEvent: TagItemContextMenuEventPayload["TagItem"],
      ) => {
        switch (tagItemEvent.eventKind) {
          case "delete_tag":
            const { id } = tagItemEvent;
            app.setDeleteTagDialogId(id);
            app.setDeleteTagDialog(true);
            break;
          default:
            break;
        }
      };

      const handleNoteTagItemEvent = (
        noteTagItemEvent: NoteTagItemContextMenuEventPayload["NoteTag"],
      ) => {
        switch (noteTagItemEvent.eventKind) {
          case "untag_note":
            const { tagId } = noteTagItemEvent;
            const filteredTags = app.currentNote?.tags.filter(
              (tag) => !(tag.id === tagId),
            );

            if (tagId === app.activeTag?.id) {
              void queryClient.invalidateQueries({ queryKey: ["notes"] });
            }

            if (app.currentNote?.tags && filteredTags) {
              if (app.currentNote) {
                app.setCurrentNote({ ...app.currentNote, tags: filteredTags });
              }
            }
            break;
          default:
            break;
        }
      };

      switch (eventKey) {
        case "NoteItem":
          handleNoteItemEvent(
            (contextMenuEventKind as NoteItemContextMenuEventPayload).NoteItem,
          );
          break;
        case "TagItem":
          handleTagItemEvent(
            (contextMenuEventKind as TagItemContextMenuEventPayload).TagItem,
          );
          break;
        case "NoteTag":
          handleNoteTagItemEvent(
            (contextMenuEventKind as NoteTagItemContextMenuEventPayload)
              .NoteTag,
          );
          break;
        default:
          break;
      }
    });

    setUnlisten(() => unlisten);
  }, [queryClient]);

  useEffect(() => {
    if (unlisten) {
      unlisten();
    }

    void listenHandler();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [listenHandler, unlisten]);
};
