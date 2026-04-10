import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
import { type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { toastErrorHandler } from "@/shared/lib/mutation-utils";
import { exportNotes, loadNote } from "@/shared/api/invoke";
import type { LoadedNote, NoteFilter } from "@/shared/api/types";
import type { DraftControl } from "@/features/shell/hooks/use-draft-control";
import { matchesTagScope } from "@/features/shell/hooks/use-view-navigation";

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
  activeTagPath: string | null;
  tagViewActive: boolean;
  noteFilter: NoteFilter;
  currentNote: LoadedNote | undefined;
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

  const handleExportNotes = () => {
    void (async () => {
      try {
        const selected = await open({
          directory: true,
          title:
            deps.tagViewActive && deps.activeTagPath
              ? `Export ${deps.activeTagPath}`
              : "Export notes",
        });
        if (!selected) return;
        await deps.draftControl.flushCurrentDraftAsync();

        const count = await exportNotes(
          deps.tagViewActive && deps.activeTagPath
            ? {
                exportMode: "tag",
                tagPath: deps.activeTagPath,
                preserveTags: true,
                exportDir: selected as string,
              }
            : {
                exportMode: "note_filter",
                noteFilter: deps.noteFilter,
                preserveTags: true,
                exportDir: selected as string,
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

        if (
          deps.currentNote &&
          deps.draftNoteId === deps.currentNote.id &&
          matchesTagScope(deps.currentNote.tags, tagPath)
        ) {
          await deps.draftControl.flushCurrentDraftAsync();
        }

        const count = await exportNotes({
          exportMode: "tag",
          tagPath,
          preserveTags: true,
          exportDir: selected as string,
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
