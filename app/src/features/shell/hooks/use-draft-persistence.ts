import { type RefObject, useEffect } from "react";
import { type QueryClient } from "@tanstack/react-query";

import { pendingDraftStorageKey, saveNote } from "@/shared/api/invoke";
import { type LoadedNote } from "@/shared/api/types";

export interface DraftPersistenceDeps {
  activeNpub: string | null;
  bootstrapNpub: string | undefined;
  bootstrapReady: boolean;
  currentNote: LoadedNote | undefined;
  draftNoteId: string | null;
  draftMarkdown: string;
  saveNotePending: boolean;
  mutateSaveNote: (input: { id: string; markdown: string }) => void;
  pendingSaveTimeoutRef: RefObject<number | null>;
  queryClient: QueryClient;
}

export function useDraftPersistence(deps: DraftPersistenceDeps) {
  const {
    activeNpub,
    bootstrapNpub,
    bootstrapReady,
    currentNote,
    draftNoteId,
    draftMarkdown,
    saveNotePending,
    mutateSaveNote,
    pendingSaveTimeoutRef,
    queryClient,
  } = deps;

  // Recover any draft that was pending when the app quit
  useEffect(() => {
    if (!bootstrapReady) return;
    if (!bootstrapNpub) return;
    const draftKey = pendingDraftStorageKey(bootstrapNpub);
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const { noteId, markdown } = JSON.parse(raw) as {
        noteId: string;
        markdown: string;
      };
      if (noteId && markdown) {
        void saveNote({ id: noteId, markdown })
          .then(() => {
            localStorage.removeItem(draftKey);
            void queryClient.invalidateQueries({ queryKey: ["note", noteId] });
            void queryClient.invalidateQueries({ queryKey: ["notes"] });
          })
          .catch(() => {});
      }
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, [bootstrapNpub, bootstrapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save debounce effect
  useEffect(() => {
    if (!currentNote || draftNoteId !== currentNote.id) {
      return;
    }

    if (currentNote.readonly) {
      return;
    }

    if (saveNotePending || draftMarkdown === currentNote.markdown) {
      return;
    }

    // Persist draft for crash recovery (survives app quit during debounce)
    try {
      if (!activeNpub) {
        return;
      }
      localStorage.setItem(
        pendingDraftStorageKey(activeNpub),
        JSON.stringify({ noteId: currentNote.id, markdown: draftMarkdown }),
      );
    } catch {
      // Ignore storage errors
    }

    pendingSaveTimeoutRef.current = window.setTimeout(() => {
      mutateSaveNote({
        id: currentNote.id,
        markdown: draftMarkdown,
      });
    }, 3000);

    return () => {
      if (pendingSaveTimeoutRef.current !== null) {
        window.clearTimeout(pendingSaveTimeoutRef.current);
        pendingSaveTimeoutRef.current = null;
      }
    };
  }, [
    activeNpub,
    currentNote,
    draftMarkdown,
    draftNoteId,
    mutateSaveNote,
    pendingSaveTimeoutRef,
    saveNotePending,
  ]);
}
