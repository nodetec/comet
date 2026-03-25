import type { RefObject } from "react";
import { type QueryClient, useMutation } from "@tanstack/react-query";

import { toastErrorHandler } from "@/shared/lib/mutation-utils";
import {
  archiveNote,
  createNote,
  deleteNotePermanently,
  duplicateNote,
  emptyTrash,
  pendingDraftStorageKey,
  pinNote,
  restoreFromTrash,
  restoreNote,
  saveNote,
  setNoteReadonly,
  trashNote,
  unpinNote,
} from "@/shared/api/invoke";
import { type NoteFilter, type NoteSummary } from "@/shared/api/types";
import { nextSelectedNoteIdAfterRemoval } from "@/features/shell/utils";

export interface NoteMutationDeps {
  queryClient: QueryClient;
  currentNotes: NoteSummary[];
  selectedNoteId: string | null;
  draftNoteId: string | null;
  draftMarkdown: string;
  noteFilter: NoteFilter;
  activeNpub: string | null;
  isSavingRef: RefObject<boolean>;
  setSelectedNoteId: (id: string | null) => void;
  setDraft: (id: string, markdown: string) => void;
  setCreatingSelectedNoteId: (id: string | null) => void;
  setIsCreatingNoteTransition: (v: boolean) => void;
  setEditorFocusMode: (mode: "none" | "immediate" | "pointerup") => void;
  setNoteFilter: (filter: NoteFilter) => void;
}

export function useNoteMutations(deps: NoteMutationDeps) {
  const {
    queryClient,
    currentNotes,
    selectedNoteId,
    draftNoteId,
    noteFilter,
    activeNpub,
    isSavingRef,
    setSelectedNoteId,
    setDraft,
    setCreatingSelectedNoteId,
    setIsCreatingNoteTransition,
    setEditorFocusMode,
    setNoteFilter,
  } = deps;

  const invalidateNotes = async () => {
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  const invalidateContextualTags = async () => {
    await queryClient.invalidateQueries({ queryKey: ["contextual-tags"] });
  };

  const invalidateShellData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      invalidateNotes(),
      invalidateContextualTags(),
    ]);
  };

  const createNoteMutation = useMutation({
    mutationFn: createNote,
    onSuccess: (note) => {
      queryClient.setQueryData(["note", note.id], note);
      setCreatingSelectedNoteId(note.id);
      setSelectedNoteId(note.id);
      setDraft(note.id, note.markdown);
      setIsCreatingNoteTransition(false);
      void Promise.all([invalidateNotes(), invalidateContextualTags()]);
    },
    onError: (error) => {
      setCreatingSelectedNoteId(null);
      setIsCreatingNoteTransition(false);
      setEditorFocusMode("none");
      toastErrorHandler("Couldn't create note", "create-note-error")(error);
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: saveNote,
    onMutate: () => {
      isSavingRef.current = true;
    },
    onSuccess: (savedNote) => {
      queryClient.setQueryData(["note", savedNote.id], savedNote);
      void Promise.all([
        invalidateNotes(),
        invalidateContextualTags(),
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
      setDraft(duplicatedNote.id, duplicatedNote.markdown);
      setEditorFocusMode("immediate");

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
      setDraft(updatedNote.id, updatedNote.markdown);
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
