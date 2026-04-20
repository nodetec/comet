import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
import { type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { toastErrorHandler } from "@/shared/lib/mutation-utils";
import { exportNotes, loadNote } from "@/shared/api/invoke";
import type { LoadedNote, NoteSummary } from "@/shared/api/types";
import type { DraftControl } from "@/features/shell/hooks/use-draft-control";
import { useDraftStore } from "@/shared/stores/use-draft-store";
import { useNavigationStore } from "@/shared/stores/use-navigation-store";

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
  queryClient: QueryClient;
  currentNotes: NoteSummary[];
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
  const { discardPendingSave, flushCurrentDraftAsync } = deps.draftControl;
  const archiveNotePending = deps.archiveNoteMutation.isPending;
  const restoreNotePending = deps.restoreNoteMutation.isPending;
  const trashNotePending = deps.trashNoteMutation.isPending;
  const restoreFromTrashPending = deps.restoreFromTrashMutation.isPending;
  const deleteNotePermanentlyPending =
    deps.deleteNotePermanentlyMutation.isPending;
  const duplicateNotePending = deps.duplicateNoteMutation.isPending;
  const pinNotePending = deps.pinNoteMutation.isPending;
  const unpinNotePending = deps.unpinNoteMutation.isPending;
  const setNoteReadonlyPending = deps.setNoteReadonlyMutation.isPending;
  const mutateArchiveNote = deps.archiveNoteMutation.mutateAsync;
  const mutateRestoreNote = deps.restoreNoteMutation.mutateAsync;
  const mutateTrashNote = deps.trashNoteMutation.mutateAsync;
  const mutateRestoreFromTrash = deps.restoreFromTrashMutation.mutateAsync;
  const mutateDeleteNotePermanently =
    deps.deleteNotePermanentlyMutation.mutateAsync;
  const mutateDuplicateNote = deps.duplicateNoteMutation.mutateAsync;
  const mutatePinNote = deps.pinNoteMutation.mutateAsync;
  const mutateUnpinNote = deps.unpinNoteMutation.mutateAsync;
  const mutateSetNoteReadonly = deps.setNoteReadonlyMutation.mutateAsync;
  const emptyTrash = deps.emptyTrashMutation.mutate;

  const isMutatingNote =
    archiveNotePending ||
    restoreNotePending ||
    deleteNotePermanentlyPending ||
    pinNotePending ||
    unpinNotePending ||
    duplicateNotePending ||
    setNoteReadonlyPending;

  const handleArchiveNote = (noteId: string) => {
    void (async () => {
      if (
        archiveNotePending ||
        restoreNotePending ||
        deleteNotePermanentlyPending
      ) {
        return;
      }

      if (noteId === useNavigationStore.getState().selectedNoteId) {
        await flushCurrentDraftAsync();
      }

      await mutateArchiveNote(noteId);
    })().catch(() => {});
  };

  const handleRestoreNote = (noteId: string) => {
    void (async () => {
      if (
        archiveNotePending ||
        restoreNotePending ||
        deleteNotePermanentlyPending
      ) {
        return;
      }

      await mutateRestoreNote(noteId);
    })().catch(() => {});
  };

  const handleTrashNote = (noteId: string) => {
    void (async () => {
      if (trashNotePending || deleteNotePermanentlyPending) {
        return;
      }

      if (noteId === useNavigationStore.getState().selectedNoteId) {
        discardPendingSave();
      }

      await mutateTrashNote(noteId);
    })().catch(() => {});
  };

  const handleRestoreFromTrash = (noteId: string) => {
    void (async () => {
      if (restoreFromTrashPending || deleteNotePermanentlyPending) {
        return;
      }

      await mutateRestoreFromTrash(noteId);
    })().catch(() => {});
  };

  const handleDeleteNotePermanently = (noteId: string) => {
    void (async () => {
      if (
        trashNotePending ||
        restoreFromTrashPending ||
        deleteNotePermanentlyPending
      ) {
        return;
      }

      if (noteId === useNavigationStore.getState().selectedNoteId) {
        discardPendingSave();
      }

      await mutateDeleteNotePermanently(noteId);
    })().catch(() => {});
  };

  const handleEmptyTrash = () => {
    emptyTrash();
  };

  const handleSetNotePinned = (noteId: string, pinned: boolean) => {
    if (isMutatingNote) {
      return;
    }

    const mutateNotePinned = pinned ? mutatePinNote : mutateUnpinNote;
    void mutateNotePinned(noteId).catch(() => {});
  };

  const handleSetNoteReadonly = (noteId: string, readonly: boolean) => {
    if (isMutatingNote) {
      return;
    }

    void (async () => {
      if (noteId === useNavigationStore.getState().selectedNoteId) {
        await flushCurrentDraftAsync();
      }

      await mutateSetNoteReadonly({
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
      if (noteId === useNavigationStore.getState().selectedNoteId) {
        await flushCurrentDraftAsync();
      }

      await mutateDuplicateNote(noteId);
    })().catch(() => {});
  };

  const handleCopyNoteContent = (noteId: string) => {
    void (async () => {
      try {
        const { draftMarkdown, draftNoteId } = useDraftStore.getState();
        const { selectedNoteId } = useNavigationStore.getState();
        if (noteId === selectedNoteId && draftNoteId === noteId) {
          await writeText(draftMarkdown);
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

  const handleExportNotes = () => {
    void (async () => {
      try {
        const { activeTagPath, noteFilter, tagViewActive } =
          useNavigationStore.getState();
        const selected = await open({
          directory: true,
          title:
            tagViewActive && activeTagPath
              ? `Export ${activeTagPath}`
              : "Export notes",
        });
        if (!selected) return;
        await flushCurrentDraftAsync();

        const count = await exportNotes(
          tagViewActive && activeTagPath
            ? {
                exportMode: "tag",
                tagPath: activeTagPath,
                preserveTags: true,
                exportDir: selected,
              }
            : {
                exportMode: "note_filter",
                noteFilter,
                preserveTags: true,
                exportDir: selected,
              },
        );

        toast.success(`Exported ${count} note${count === 1 ? "" : "s"}`, {
          id: "export-notes-success",
        });
      } catch (error) {
        toastErrorHandler("Couldn't export notes", "export-notes-error")(error);
      }
    })();
  };

  const handleExportTag = (tagPath: string) => {
    void (async () => {
      try {
        const selected = await open({
          directory: true,
          title: `Export ${tagPath}`,
        });
        if (!selected) return;

        await flushCurrentDraftAsync();

        const count = await exportNotes({
          exportMode: "tag",
          tagPath,
          preserveTags: true,
          exportDir: selected,
        });

        toast.success(`Exported ${count} note${count === 1 ? "" : "s"}`, {
          id: "export-tag-success",
        });
      } catch (error) {
        toastErrorHandler("Couldn't export tag", "export-tag-error")(error);
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
    handleExportNotes,
    handleExportTag,
  };
}
