import type { RefObject } from "react";

import type { LoadedNote, WikiLinkResolutionInput } from "@/shared/api/types";

export interface DraftControlDeps {
  currentNote: LoadedNote | undefined;
  draftNoteId: string | null;
  draftMarkdown: string;
  draftWikilinkResolutions: WikiLinkResolutionInput[];
  isCurrentNoteConflicted: boolean;
  hasPendingWikilinkResolutionChanges: boolean;
  pendingSaveTimeoutRef: RefObject<number | null>;
  saveNoteMutation: {
    mutate: (input: {
      id: string;
      markdown: string;
      wikilinkResolutions: WikiLinkResolutionInput[];
    }) => void;
    mutateAsync: (input: {
      id: string;
      markdown: string;
      wikilinkResolutions: WikiLinkResolutionInput[];
    }) => Promise<{ note: LoadedNote }>;
  };
}

export function useDraftControl(deps: DraftControlDeps) {
  const flushCurrentDraft = () => {
    const {
      currentNote,
      draftNoteId,
      draftMarkdown,
      draftWikilinkResolutions,
    } = deps;

    if (!currentNote || draftNoteId !== currentNote.id) {
      return;
    }

    if (deps.isCurrentNoteConflicted) {
      return;
    }

    if (
      draftMarkdown === currentNote.markdown &&
      !deps.hasPendingWikilinkResolutionChanges
    ) {
      return;
    }

    if (deps.pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(deps.pendingSaveTimeoutRef.current);
      deps.pendingSaveTimeoutRef.current = null;
    }

    deps.saveNoteMutation.mutate({
      id: currentNote.id,
      markdown: draftMarkdown,
      wikilinkResolutions: draftWikilinkResolutions,
    });
  };

  const flushCurrentDraftAsync = async (): Promise<LoadedNote | undefined> => {
    const {
      currentNote,
      draftNoteId,
      draftMarkdown,
      draftWikilinkResolutions,
    } = deps;

    if (!currentNote || draftNoteId !== currentNote.id) {
      return undefined;
    }

    if (deps.isCurrentNoteConflicted) {
      return undefined;
    }

    if (
      draftMarkdown === currentNote.markdown &&
      !deps.hasPendingWikilinkResolutionChanges
    ) {
      return undefined;
    }

    if (deps.pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(deps.pendingSaveTimeoutRef.current);
      deps.pendingSaveTimeoutRef.current = null;
    }

    const response = await deps.saveNoteMutation.mutateAsync({
      id: currentNote.id,
      markdown: draftMarkdown,
      wikilinkResolutions: draftWikilinkResolutions,
    });
    return response.note;
  };

  const withFlushedCurrentDraft = (
    action: (savedNote?: LoadedNote) => void | Promise<void>,
  ) => {
    void (async () => {
      try {
        const savedNote = await flushCurrentDraftAsync();
        await action(savedNote);
      } catch {
        // Save failures already surface through the mutation error handler.
      }
    })();
  };

  const discardPendingSave = () => {
    if (deps.pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(deps.pendingSaveTimeoutRef.current);
      deps.pendingSaveTimeoutRef.current = null;
    }
  };

  return {
    flushCurrentDraft,
    flushCurrentDraftAsync,
    withFlushedCurrentDraft,
    discardPendingSave,
  };
}

export type DraftControl = ReturnType<typeof useDraftControl>;
