import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { type QueryClient } from "@tanstack/react-query";

import { toastErrorHandler } from "@/shared/lib/mutation-utils";
import { loadNote } from "@/shared/api/invoke";
import type { LoadedNote } from "@/shared/api/types";
import type { DraftControl } from "@/features/shell/hooks/use-draft-control";

type Mutation<TArg = string> = {
  isPending: boolean;
  mutateAsync: (arg: TArg) => Promise<unknown>;
};

type VoidMutation = {
  isPending: boolean;
  mutate: () => void;
};

export interface NoteOperationsDeps {
  draftControl: DraftControl;
  selectedNoteId: string | null;
  draftNoteId: string | null;
  draftMarkdown: string;
  queryClient: QueryClient;
  archiveNoteMutation: Mutation;
  restoreNoteMutation: Mutation;
  trashNoteMutation: Mutation;
  restoreFromTrashMutation: Mutation;
  deleteNotePermanentlyMutation: Mutation;
  emptyTrashMutation: VoidMutation;
  pinNoteMutation: Mutation;
  unpinNoteMutation: Mutation;
  duplicateNoteMutation: Mutation;
  setNoteReadonlyMutation: Mutation<{ noteId: string; readonly: boolean }>;
}

export function useNoteOperations(deps: NoteOperationsDeps) {
  const isMutatingNote =
    deps.archiveNoteMutation.isPending ||
    deps.restoreNoteMutation.isPending ||
    deps.deleteNotePermanentlyMutation.isPending ||
    deps.pinNoteMutation.isPending ||
    deps.unpinNoteMutation.isPending ||
    deps.duplicateNoteMutation.isPending ||
    deps.setNoteReadonlyMutation.isPending;

  const handleArchiveNote = (noteId: string) => {
    void (async () => {
      if (
        deps.archiveNoteMutation.isPending ||
        deps.restoreNoteMutation.isPending ||
        deps.deleteNotePermanentlyMutation.isPending
      ) {
        return;
      }

      if (noteId === deps.selectedNoteId) {
        await deps.draftControl.flushCurrentDraftAsync();
      }

      await deps.archiveNoteMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleRestoreNote = (noteId: string) => {
    void (async () => {
      if (
        deps.archiveNoteMutation.isPending ||
        deps.restoreNoteMutation.isPending ||
        deps.deleteNotePermanentlyMutation.isPending
      ) {
        return;
      }

      await deps.restoreNoteMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleTrashNote = (noteId: string) => {
    void (async () => {
      if (
        deps.trashNoteMutation.isPending ||
        deps.deleteNotePermanentlyMutation.isPending
      ) {
        return;
      }

      if (noteId === deps.selectedNoteId) {
        deps.draftControl.discardPendingSave();
      }

      await deps.trashNoteMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleRestoreFromTrash = (noteId: string) => {
    void (async () => {
      if (
        deps.restoreFromTrashMutation.isPending ||
        deps.deleteNotePermanentlyMutation.isPending
      ) {
        return;
      }

      await deps.restoreFromTrashMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleDeleteNotePermanently = (noteId: string) => {
    void (async () => {
      if (
        deps.trashNoteMutation.isPending ||
        deps.restoreFromTrashMutation.isPending ||
        deps.deleteNotePermanentlyMutation.isPending
      ) {
        return;
      }

      if (noteId === deps.selectedNoteId) {
        deps.draftControl.discardPendingSave();
      }

      await deps.deleteNotePermanentlyMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleEmptyTrash = () => {
    deps.emptyTrashMutation.mutate();
  };

  const handleSetNotePinned = (noteId: string, pinned: boolean) => {
    if (isMutatingNote) {
      return;
    }

    const mutation = pinned ? deps.pinNoteMutation : deps.unpinNoteMutation;
    void mutation.mutateAsync(noteId).catch(() => {});
  };

  const handleSetNoteReadonly = (noteId: string, readonly: boolean) => {
    if (isMutatingNote) {
      return;
    }

    void (async () => {
      if (noteId === deps.selectedNoteId) {
        await deps.draftControl.flushCurrentDraftAsync();
      }

      await deps.setNoteReadonlyMutation.mutateAsync({
        noteId,
        readonly,
      });
    })().catch(() => {});
  };

  const handleDuplicateNote = (noteId: string) => {
    if (isMutatingNote) {
      return;
    }

    void (async () => {
      if (noteId === deps.selectedNoteId) {
        await deps.draftControl.flushCurrentDraftAsync();
      }

      await deps.duplicateNoteMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleCopyNoteContent = (noteId: string) => {
    void (async () => {
      try {
        if (noteId === deps.selectedNoteId && deps.draftNoteId === noteId) {
          await writeText(deps.draftMarkdown);
          return;
        }

        const note =
          deps.queryClient.getQueryData<LoadedNote>(["note", noteId]) ??
          (await loadNote(noteId));

        await writeText(note.markdown);
      } catch (error) {
        toastErrorHandler("Couldn't copy note", "copy-note-error")(error);
      }
    })();
  };

  return {
    isMutatingNote,
    handleArchiveNote,
    handleRestoreNote,
    handleTrashNote,
    handleRestoreFromTrash,
    handleDeleteNotePermanently,
    handleEmptyTrash,
    handleSetNotePinned,
    handleSetNoteReadonly,
    handleDuplicateNote,
    handleCopyNoteContent,
  };
}
