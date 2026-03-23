import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createNote,
  saveNote,
  archiveNote,
  restoreNote,
  trashNote,
  restoreFromTrash,
  deleteNotePermanently,
  emptyTrash,
  pinNote,
  unpinNote,
  duplicateNote,
  createNotebook,
  renameNotebook,
  deleteNotebook,
  assignNoteNotebook,
} from '../api/bridge';

function useInvalidateNotes() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['notes'] });
    queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
    queryClient.invalidateQueries({ queryKey: ['contextual-tags'] });
  };
}

export function useCreateNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: (params: {
      notebookId?: string | null;
      tags?: string[];
      markdown?: string | null;
    }) =>
      createNote(params.notebookId ?? null, params.tags ?? [], params.markdown),
    onSuccess: invalidate,
  });
}

export function useSaveNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; markdown: string }) => saveNote(params),
    onSuccess: (data) => {
      queryClient.setQueryData(['note', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

export function useArchiveNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: archiveNote, onSuccess: invalidate });
}

export function useRestoreNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: restoreNote, onSuccess: invalidate });
}

export function useTrashNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: trashNote, onSuccess: invalidate });
}

export function useRestoreFromTrash() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: restoreFromTrash, onSuccess: invalidate });
}

export function useDeleteNotePermanently() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: deleteNotePermanently,
    onSuccess: invalidate,
  });
}

export function useEmptyTrash() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: emptyTrash, onSuccess: invalidate });
}

export function usePinNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: pinNote, onSuccess: invalidate });
}

export function useUnpinNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: unpinNote, onSuccess: invalidate });
}

export function useDuplicateNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: duplicateNote, onSuccess: invalidate });
}

export function useCreateNotebook() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: (name: string) => createNotebook(name),
    onSuccess: invalidate,
  });
}

export function useRenameNotebook() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: (params: { notebookId: string; name: string }) =>
      renameNotebook(params.notebookId, params.name),
    onSuccess: invalidate,
  });
}

export function useDeleteNotebook() {
  const invalidate = useInvalidateNotes();
  return useMutation({ mutationFn: deleteNotebook, onSuccess: invalidate });
}

export function useAssignNoteNotebook() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: (params: { noteId: string; notebookId: string | null }) =>
      assignNoteNotebook(params.noteId, params.notebookId),
    onSuccess: invalidate,
  });
}
