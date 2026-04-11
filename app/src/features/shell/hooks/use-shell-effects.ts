import { type RefObject, useEffect } from "react";
import { type QueryClient } from "@tanstack/react-query";

import { useAccountChangePreparation } from "@/features/shell/hooks/use-account-change-preparation";
import { useShellCommandHandlers } from "@/features/shell/hooks/use-shell-command-handlers";
import { useSyncListener } from "@/features/shell/hooks/use-sync-listener";
import type { LoadedNote, NoteFilter } from "@/shared/api/types";

type CreateNoteMutation = {
  isPending: boolean;
  mutate: (input: {
    tags: string[];
    markdown: string;
    autoFocusEditor?: boolean;
  }) => void;
};

export interface ShellEffectsDeps {
  queryClient: QueryClient;
  pendingSaveTimeoutRef: RefObject<number | null>;
  isSavingRef: RefObject<boolean>;
  bumpSyncEditorRevision: (
    reason: string,
    details?: Record<string, unknown>,
  ) => void;
  activeTagPath: string | null;
  availableTagPaths: string[];
  selectedNoteId: string | null;
  draftNoteId: string | null;
  noteQueryData: LoadedNote | undefined;
  noteQueryIsPlaceholderData: boolean;
  bootstrapSuccess: boolean;
  initialSelectedNoteId: string | null;
  hasHydratedInitialSelection: boolean;
  isCreatingNoteTransition: boolean;
  createNoteMutation: CreateNoteMutation;
  noteFilter: NoteFilter;
  tagViewActive: boolean;
  isCreatingNote: boolean;
  setActiveTagPath: (path: string | null) => void;
  setDraft: (
    noteId: string,
    markdown: string,
    options?: {
      preserveWikilinkResolutions?: boolean;
      wikilinkResolutions?: LoadedNote["wikilinkResolutions"];
    },
  ) => void;
  setHasHydratedInitialSelection: (value: boolean) => void;
  setSelectedNoteId: (noteId: string | null) => void;
  setTagViewActive: (active: boolean) => void;
  flushCurrentDraft: () => void;
  flushCurrentDraftAsync: () => Promise<unknown>;
  handleSelectTagPath: (tagPath: string) => void;
  handleSelectNote: (noteId: string) => void;
}

export function useShellEffects(deps: ShellEffectsDeps) {
  useSyncListener({
    queryClient: deps.queryClient,
    pendingSaveTimeoutRef: deps.pendingSaveTimeoutRef,
    isSavingRef: deps.isSavingRef,
    bumpSyncEditorRevision: deps.bumpSyncEditorRevision,
  });

  useAccountChangePreparation({
    flushCurrentDraftAsync: deps.flushCurrentDraftAsync,
  });

  useEffect(() => {
    if (!deps.activeTagPath) {
      return;
    }

    if (!deps.availableTagPaths.includes(deps.activeTagPath)) {
      deps.setActiveTagPath(null);
      deps.setTagViewActive(false);
    }
  }, [
    deps.activeTagPath,
    deps.availableTagPaths,
    deps.setActiveTagPath,
    deps.setTagViewActive,
  ]);

  useEffect(() => {
    if (!deps.selectedNoteId) {
      return;
    }

    if (deps.noteQueryIsPlaceholderData) {
      return;
    }

    if (deps.noteQueryData && deps.noteQueryData.id !== deps.draftNoteId) {
      deps.setDraft(deps.noteQueryData.id, deps.noteQueryData.markdown, {
        wikilinkResolutions: deps.noteQueryData.wikilinkResolutions,
      });
    }
  }, [
    deps.draftNoteId,
    deps.noteQueryData,
    deps.noteQueryIsPlaceholderData,
    deps.selectedNoteId,
    deps.setDraft,
  ]);

  useEffect(() => {
    if (
      deps.hasHydratedInitialSelection ||
      deps.createNoteMutation.isPending ||
      deps.isCreatingNoteTransition
    ) {
      return;
    }

    if (deps.initialSelectedNoteId && !deps.selectedNoteId) {
      deps.setSelectedNoteId(deps.initialSelectedNoteId);
      deps.setHasHydratedInitialSelection(true);
      return;
    }

    if (deps.bootstrapSuccess) {
      deps.setHasHydratedInitialSelection(true);
    }
  }, [
    deps.bootstrapSuccess,
    deps.createNoteMutation.isPending,
    deps.hasHydratedInitialSelection,
    deps.initialSelectedNoteId,
    deps.isCreatingNoteTransition,
    deps.selectedNoteId,
    deps.setHasHydratedInitialSelection,
    deps.setSelectedNoteId,
  ]);

  useShellCommandHandlers({
    activeTagPath: deps.activeTagPath,
    tagViewActive: deps.tagViewActive,
    noteFilter: deps.noteFilter,
    isCreatingNote: deps.isCreatingNote,
    createNoteMutation: deps.createNoteMutation,
    flushCurrentDraft: deps.flushCurrentDraft,
    handleSelectTagPath: deps.handleSelectTagPath,
    handleSelectNote: deps.handleSelectNote,
  });
}
