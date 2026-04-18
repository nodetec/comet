import { type RefObject } from "react";
import { type QueryClient } from "@tanstack/react-query";

import type {
  LoadedNote,
  NoteConflictInfo,
  WikiLinkResolutionInput,
} from "@/shared/api/types";
import { useShellDraftStore } from "@/shared/stores/use-shell-draft-store";
import { haveSameWikilinkResolutions } from "@/shared/lib/wikilink-resolutions";

export interface DraftControlDeps {
  queryClient: QueryClient;
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
  const { mutate, mutateAsync } = deps.saveNoteMutation;

  const getCurrentDraftState = () => {
    const { draftMarkdown, draftNoteId, draftWikilinkResolutions } =
      useShellDraftStore.getState();
    if (!draftNoteId) {
      return null;
    }

    const currentNote = deps.queryClient.getQueryData<LoadedNote>([
      "note",
      draftNoteId,
    ]);
    if (!currentNote || draftNoteId !== currentNote.id) {
      return null;
    }

    const noteConflict =
      deps.queryClient.getQueryData<NoteConflictInfo | null>([
        "note-conflict",
        draftNoteId,
      ]) ?? null;
    const isCurrentNoteConflicted = (noteConflict?.snapshotCount ?? 0) > 1;
    const hasPendingWikilinkResolutionChanges = !haveSameWikilinkResolutions(
      draftWikilinkResolutions,
      currentNote.wikilinkResolutions,
    );

    return {
      currentNote,
      draftMarkdown,
      draftWikilinkResolutions,
      hasPendingWikilinkResolutionChanges,
      isCurrentNoteConflicted,
    };
  };

  const flushCurrentDraft = () => {
    const draftState = getCurrentDraftState();
    if (!draftState) {
      return;
    }

    const {
      currentNote,
      draftMarkdown,
      draftWikilinkResolutions,
      hasPendingWikilinkResolutionChanges,
      isCurrentNoteConflicted,
    } = draftState;

    if (isCurrentNoteConflicted) {
      return;
    }

    if (
      draftMarkdown === currentNote.markdown &&
      !hasPendingWikilinkResolutionChanges
    ) {
      return;
    }

    if (deps.pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(deps.pendingSaveTimeoutRef.current);
      deps.pendingSaveTimeoutRef.current = null;
    }

    mutate({
      id: currentNote.id,
      markdown: draftMarkdown,
      wikilinkResolutions: draftWikilinkResolutions,
    });
  };

  const flushCurrentDraftAsync = async (): Promise<LoadedNote | undefined> => {
    const draftState = getCurrentDraftState();
    if (!draftState) {
      return undefined;
    }

    const {
      currentNote,
      draftMarkdown,
      draftWikilinkResolutions,
      hasPendingWikilinkResolutionChanges,
      isCurrentNoteConflicted,
    } = draftState;

    if (isCurrentNoteConflicted) {
      return undefined;
    }

    if (
      draftMarkdown === currentNote.markdown &&
      !hasPendingWikilinkResolutionChanges
    ) {
      return undefined;
    }

    if (deps.pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(deps.pendingSaveTimeoutRef.current);
      deps.pendingSaveTimeoutRef.current = null;
    }

    const response = await mutateAsync({
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
