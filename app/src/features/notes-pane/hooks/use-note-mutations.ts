import type { RefObject } from "react";
import { type QueryClient, useMutation } from "@tanstack/react-query";

import { toastErrorHandler } from "@/shared/lib/mutation-utils";
import {
  archiveNote,
  createNote,
  deleteNotePermanently,
  duplicateNote,
  emptyTrash,
  loadNote,
  pendingDraftStorageKey,
  pinNote,
  restoreFromTrash,
  restoreNote,
  saveNote,
  setNoteReadonly,
  trashNote,
  unpinNote,
} from "@/shared/api/invoke";
import {
  type NoteFilter,
  type NoteSummary,
  type WikiLinkResolutionInput,
} from "@/shared/api/types";
import {
  shellStore,
  useShellActions,
} from "@/features/shell/store/use-shell-store";
import { nextSelectedNoteIdAfterRemoval } from "@/features/shell/utils";
import { haveSameWikilinkResolutions } from "@/shared/lib/wikilink-resolutions";

export interface NoteMutationDeps {
  queryClient: QueryClient;
  currentNotes: NoteSummary[];
  selectedNoteId: string | null;
  draftNoteId: string | null;
  draftMarkdown: string;
  noteFilter: NoteFilter;
  activeNpub: string | null;
  isSavingRef: RefObject<boolean>;
  clearDraftWikilinkResolutions: (noteId?: string) => void;
  setSelectedNoteId: (id: string | null) => void;
  setDraft: (
    id: string,
    markdown: string,
    options?: {
      preserveWikilinkResolutions?: boolean;
      wikilinkResolutions?: WikiLinkResolutionInput[];
    },
  ) => void;
  setNoteFilter: (filter: NoteFilter) => void;
}

type CreateNoteMutationInput = {
  tags: string[];
  markdown?: string;
  autoFocusEditor?: boolean;
};

export function useNoteMutations(deps: NoteMutationDeps) {
  const {
    queryClient,
    currentNotes,
    selectedNoteId,
    draftNoteId,
    noteFilter,
    activeNpub,
    isSavingRef,
    clearDraftWikilinkResolutions,
    setSelectedNoteId,
    setDraft,
    setNoteFilter,
  } = deps;

  const {
    setCreatingSelectedNoteId,
    setPendingAutoFocusEditorNoteId,
    setIsCreatingNoteTransition,
  } = useShellActions();

  const invalidateNotes = async () => {
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  const invalidateLoadedNotes = async () => {
    await queryClient.invalidateQueries({ queryKey: ["note"] });
  };

  const invalidateContextualTags = async () => {
    await queryClient.invalidateQueries({ queryKey: ["contextual-tags"] });
  };

  const invalidateNoteBacklinks = async () => {
    await queryClient.invalidateQueries({ queryKey: ["note-backlinks"] });
  };

  const invalidateShellData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      invalidateNotes(),
      invalidateContextualTags(),
      invalidateNoteBacklinks(),
    ]);
  };

  const createNoteMutation = useMutation({
    mutationFn: ({
      autoFocusEditor: _autoFocusEditor,
      ...input
    }: CreateNoteMutationInput) => createNote(input),
    onSuccess: (note, variables) => {
      queryClient.setQueryData(["note", note.id], note);
      setCreatingSelectedNoteId(note.id);
      setPendingAutoFocusEditorNoteId(
        variables.autoFocusEditor === false ? null : note.id,
      );
      setSelectedNoteId(note.id);
      setDraft(note.id, note.markdown, {
        wikilinkResolutions: note.wikilinkResolutions,
      });
      setIsCreatingNoteTransition(false);
      void Promise.all([invalidateNotes(), invalidateContextualTags()]);
    },
    onError: (error) => {
      setCreatingSelectedNoteId(null);
      setIsCreatingNoteTransition(false);
      toastErrorHandler("Couldn't create note", "create-note-error")(error);
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: saveNote,
    onMutate: (input: {
      id: string;
      markdown: string;
      wikilinkResolutions?: WikiLinkResolutionInput[];
    }) => {
      isSavingRef.current = true;
      return {
        noteId: input.id,
        submittedMarkdown: input.markdown,
        submittedWikilinkResolutions: input.wikilinkResolutions ?? [],
      };
    },
    onSuccess: async (response, _variables, context) => {
      const { note: savedNote, affectedLinkedNoteIds } = response;
      queryClient.setQueryData(["note", savedNote.id], savedNote);

      if (context?.noteId === savedNote.id) {
        const {
          draftMarkdown: liveDraftMarkdown,
          draftNoteId: liveDraftNoteId,
          draftWikilinkResolutions: liveDraftWikilinkResolutions,
        } = shellStore.getState();
        const shouldReconcileDraft =
          liveDraftNoteId === savedNote.id &&
          liveDraftMarkdown === context.submittedMarkdown &&
          haveSameWikilinkResolutions(
            liveDraftWikilinkResolutions,
            context.submittedWikilinkResolutions,
          );

        if (shouldReconcileDraft) {
          setDraft(savedNote.id, savedNote.markdown, {
            wikilinkResolutions: savedNote.wikilinkResolutions,
          });
        }
      }

      // Eagerly refresh affected notes so their cache has the rewritten wikilinks
      if (affectedLinkedNoteIds.length > 0) {
        const { draftNoteId: liveDraftNoteId } = shellStore.getState();
        const refreshResults = await Promise.allSettled(
          affectedLinkedNoteIds.map((id) => loadNote(id)),
        );
        for (const result of refreshResults) {
          if (result.status !== "fulfilled") continue;
          const refreshed = result.value;
          queryClient.setQueryData(["note", refreshed.id], refreshed);
          if (refreshed.id === liveDraftNoteId) {
            setDraft(refreshed.id, refreshed.markdown, {
              wikilinkResolutions: refreshed.wikilinkResolutions,
            });
          }
        }
      }

      void Promise.all([
        invalidateLoadedNotes(),
        invalidateNotes(),
        invalidateContextualTags(),
        invalidateNoteBacklinks(),
        queryClient.invalidateQueries({ queryKey: ["todo-count"] }),
      ]);
      try {
        if (activeNpub) {
          localStorage.removeItem(pendingDraftStorageKey(activeNpub));
        }
      } catch {
        // Ignore
      }
    },
    onError: toastErrorHandler(
      "Couldn't save note",
      "save-note-error",
      "Your latest changes were not saved.",
    ),
    onSettled: () => {
      isSavingRef.current = false;
    },
  });

  const duplicateNoteMutation = useMutation({
    mutationFn: duplicateNote,
    onSuccess: (duplicatedNote) => {
      queryClient.setQueryData(["note", duplicatedNote.id], duplicatedNote);
      setCreatingSelectedNoteId(null);
      setSelectedNoteId(duplicatedNote.id);
      setDraft(duplicatedNote.id, duplicatedNote.markdown, {
        wikilinkResolutions: duplicatedNote.wikilinkResolutions,
      });

      if (noteFilter === "archive" || noteFilter === "trash") {
        setNoteFilter("all");
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler(
      "Couldn't duplicate note",
      "duplicate-note-error",
    ),
  });

  const archiveNoteMutation = useMutation({
    mutationFn: archiveNote,
    onSuccess: (archivedNote) => {
      queryClient.setQueryData(["note", archivedNote.id], archivedNote);

      if (selectedNoteId === archivedNote.id && noteFilter !== "archive") {
        setSelectedNoteId(
          nextSelectedNoteIdAfterRemoval(currentNotes, archivedNote.id),
        );
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler("Couldn't archive note", "archive-note-error"),
  });

  const restoreNoteMutation = useMutation({
    mutationFn: restoreNote,
    onSuccess: (restoredNote) => {
      queryClient.setQueryData(["note", restoredNote.id], restoredNote);

      if (selectedNoteId === restoredNote.id && noteFilter === "archive") {
        setSelectedNoteId(
          nextSelectedNoteIdAfterRemoval(currentNotes, restoredNote.id),
        );
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler("Couldn't restore note", "restore-note-error"),
  });

  const trashNoteMutation = useMutation({
    mutationFn: trashNote,
    onSuccess: (trashedNote) => {
      queryClient.setQueryData(["note", trashedNote.id], trashedNote);

      if (selectedNoteId === trashedNote.id && noteFilter !== "trash") {
        setSelectedNoteId(
          nextSelectedNoteIdAfterRemoval(currentNotes, trashedNote.id),
        );
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler("Couldn't delete note", "trash-note-error"),
  });

  const restoreFromTrashMutation = useMutation({
    mutationFn: restoreFromTrash,
    onSuccess: (restoredNote) => {
      queryClient.setQueryData(["note", restoredNote.id], restoredNote);

      if (selectedNoteId === restoredNote.id && noteFilter === "trash") {
        setSelectedNoteId(
          nextSelectedNoteIdAfterRemoval(currentNotes, restoredNote.id),
        );
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler(
      "Couldn't restore note",
      "restore-from-trash-error",
    ),
  });

  const deleteNotePermanentlyMutation = useMutation({
    mutationFn: deleteNotePermanently,
    onSuccess: (_, noteId) => {
      queryClient.removeQueries({ exact: true, queryKey: ["note", noteId] });

      if (draftNoteId === noteId) {
        setDraft("", "");
        clearDraftWikilinkResolutions(noteId);
      }

      if (selectedNoteId === noteId) {
        setSelectedNoteId(nextSelectedNoteIdAfterRemoval(currentNotes, noteId));
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler("Couldn't delete note", "delete-note-error"),
  });

  const emptyTrashMutation = useMutation({
    mutationFn: emptyTrash,
    onSuccess: () => {
      setSelectedNoteId(null);
      setDraft("", "");
      clearDraftWikilinkResolutions();
      void invalidateShellData();
    },
    onError: toastErrorHandler("Couldn't empty trash", "empty-trash-error"),
  });

  const pinNoteMutation = useMutation({
    mutationFn: pinNote,
    onSuccess: (updatedNote) => {
      queryClient.setQueryData(["note", updatedNote.id], updatedNote);
      void invalidateNotes();
    },
    onError: toastErrorHandler("Couldn't pin note", "pin-note-error"),
  });

  const unpinNoteMutation = useMutation({
    mutationFn: unpinNote,
    onSuccess: (updatedNote) => {
      queryClient.setQueryData(["note", updatedNote.id], updatedNote);
      void invalidateNotes();
    },
    onError: toastErrorHandler("Couldn't unpin note", "unpin-note-error"),
  });

  const setNoteReadonlyMutation = useMutation({
    mutationFn: setNoteReadonly,
    onSuccess: (updatedNote) => {
      queryClient.setQueryData(["note", updatedNote.id], updatedNote);
      setDraft(updatedNote.id, updatedNote.markdown, {
        wikilinkResolutions: updatedNote.wikilinkResolutions,
      });
      void invalidateNotes();
    },
    onError: toastErrorHandler(
      "Couldn't update note access",
      "set-note-readonly-error",
    ),
  });

  return {
    createNoteMutation,
    saveNoteMutation,
    duplicateNoteMutation,
    archiveNoteMutation,
    restoreNoteMutation,
    trashNoteMutation,
    restoreFromTrashMutation,
    deleteNotePermanentlyMutation,
    emptyTrashMutation,
    pinNoteMutation,
    unpinNoteMutation,
    setNoteReadonlyMutation,
    invalidateNotes,
    invalidateContextualTags,
    invalidateShellData,
  };
}
