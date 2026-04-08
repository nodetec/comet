import { type RefObject, useEffect } from "react";
import { type QueryClient } from "@tanstack/react-query";

import {
  getNoteConflict,
  pendingDraftStorageKey,
  saveNote,
} from "@/shared/api/invoke";
import {
  type LoadedNote,
  type WikiLinkResolutionInput,
} from "@/shared/api/types";
import { haveSameWikilinkResolutions } from "@/shared/lib/wikilink-resolutions";

type PendingDraftPayload = {
  noteId: string;
  markdown: string;
  wikilinkResolutions?: WikiLinkResolutionInput[];
};

export interface DraftPersistenceDeps {
  activeNpub: string | null;
  bootstrapNpub: string | undefined;
  bootstrapReady: boolean;
  currentNote: LoadedNote | undefined;
  draftNoteId: string | null;
  draftMarkdown: string;
  draftWikilinkResolutions: WikiLinkResolutionInput[];
  isCurrentNoteConflicted: boolean;
  saveNotePending: boolean;
  mutateSaveNote: (input: {
    id: string;
    markdown: string;
    wikilinkResolutions?: WikiLinkResolutionInput[];
  }) => void;
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
    draftWikilinkResolutions,
    isCurrentNoteConflicted,
    saveNotePending,
    mutateSaveNote,
    pendingSaveTimeoutRef,
    queryClient,
  } = deps;
  const hasPendingWikilinkResolutionChanges = currentNote
    ? !haveSameWikilinkResolutions(
        draftWikilinkResolutions,
        currentNote.wikilinkResolutions,
      )
    : draftWikilinkResolutions.length > 0;

  // Recover any draft that was pending when the app quit
  useEffect(() => {
    if (!bootstrapReady) return;
    if (!bootstrapNpub) return;
    const draftKey = pendingDraftStorageKey(bootstrapNpub);
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const {
        noteId,
        markdown,
        wikilinkResolutions = [],
      } = JSON.parse(raw) as PendingDraftPayload;
      if (noteId && markdown) {
        void getNoteConflict(noteId)
          .then((conflict) => {
            if (conflict && conflict.snapshotCount > 1) {
              localStorage.removeItem(draftKey);
              return;
            }

            return saveNote({
              id: noteId,
              markdown,
              wikilinkResolutions,
            }).then(() => {
              localStorage.removeItem(draftKey);
              void queryClient.invalidateQueries({
                queryKey: ["note", noteId],
              });
              void queryClient.invalidateQueries({ queryKey: ["notes"] });
            });
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

    if (isCurrentNoteConflicted) {
      return;
    }

    if (
      saveNotePending ||
      (!hasPendingWikilinkResolutionChanges &&
        draftMarkdown === currentNote.markdown)
    ) {
      return;
    }

    // Persist draft for crash recovery (survives app quit during debounce)
    try {
      if (!activeNpub) {
        return;
      }
      localStorage.setItem(
        pendingDraftStorageKey(activeNpub),
        JSON.stringify({
          noteId: currentNote.id,
          markdown: draftMarkdown,
          wikilinkResolutions: draftWikilinkResolutions,
        } satisfies PendingDraftPayload),
      );
    } catch {
      // Ignore storage errors
    }

    pendingSaveTimeoutRef.current = window.setTimeout(() => {
      mutateSaveNote({
        id: currentNote.id,
        markdown: draftMarkdown,
        wikilinkResolutions: draftWikilinkResolutions,
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
    draftWikilinkResolutions,
    draftNoteId,
    hasPendingWikilinkResolutionChanges,
    isCurrentNoteConflicted,
    mutateSaveNote,
    pendingSaveTimeoutRef,
    saveNotePending,
  ]);
}
