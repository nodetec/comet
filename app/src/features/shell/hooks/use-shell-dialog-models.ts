import type {
  LoadedNote,
  NoteConflictInfo,
  NoteHistoryInfo,
  PublishNoteInput,
  PublishShortNoteInput,
} from "@/shared/api/types";

export interface ShellDialogModelsDeps {
  chooseConflictDialogOpen: boolean;
  currentEditorMarkdown: string;
  currentNote: LoadedNote | undefined;
  currentNoteConflict: NoteConflictInfo | null | undefined;
  currentNoteHistory: NoteHistoryInfo | undefined;
  currentNoteId: string | null;
  deletePublishDialogOpen: boolean;
  isCurrentNoteConflicted: boolean;
  isDeletePublishedNotePending: boolean;
  isPublishNotePending: boolean;
  isPublishShortNotePending: boolean;
  isResolveConflictPending: boolean;
  isRestoreHistoryPending: boolean;
  mutateDeletePublishedNote: (noteId: string) => void;
  mutatePublishNote: (input: PublishNoteInput) => void;
  mutatePublishShortNote: (input: PublishShortNoteInput) => void;
  noteHistoryDialogOpen: boolean;
  publishDialogOpen: boolean;
  publishShortNoteDialogOpen: boolean;
  selectedHistorySnapshotId: string | null;
  setChooseConflictDialogOpen: (open: boolean) => void;
  setChooseConflictNoteId: (noteId: string | null) => void;
  setDeletePublishDialogOpen: (open: boolean) => void;
  setNoteHistoryDialogOpen: (open: boolean) => void;
  setPublishDialogOpen: (open: boolean) => void;
  setPublishShortNoteDialogOpen: (open: boolean) => void;
  setUserHistorySnapshotId: (snapshotId: string | null) => void;
  handleResolveCurrentNoteConflict: (
    action: "restore" | "keep_deleted" | "merge",
  ) => Promise<void>;
  handleRestoreSelectedNoteHistorySnapshot: () => Promise<void>;
  handleSelectNoteHistorySnapshot: (snapshotId: string) => void;
}

export function useShellDialogModels(deps: ShellDialogModelsDeps) {
  const publishDialogProps = {
    content: deps.currentEditorMarkdown,
    initialTitle: deps.currentNote?.title ?? "",
    initialTags: deps.currentNote?.tags ?? [],
    noteId: deps.currentNote?.id ?? "",
    open: deps.publishDialogOpen,
    pending: deps.isPublishNotePending,
    onOpenChange: deps.setPublishDialogOpen,
    onSubmit(input: PublishNoteInput) {
      deps.mutatePublishNote(input);
    },
  };

  const publishShortNoteDialogProps = {
    content: deps.currentEditorMarkdown.replace(/^#\s+.*\n*/, "").trim(),
    initialTags: deps.currentNote?.tags ?? [],
    noteId: deps.currentNote?.id ?? "",
    open: deps.publishShortNoteDialogOpen,
    pending: deps.isPublishShortNotePending,
    onOpenChange: deps.setPublishShortNoteDialogOpen,
    onSubmit(input: PublishShortNoteInput) {
      deps.mutatePublishShortNote(input);
    },
  };

  const deletePublishDialogProps = {
    open: deps.deletePublishDialogOpen,
    pending: deps.isDeletePublishedNotePending,
    onOpenChange: deps.setDeletePublishDialogOpen,
    onConfirm() {
      if (deps.currentNoteId) {
        deps.mutateDeletePublishedNote(deps.currentNoteId);
      }
    },
  };

  const chooseConflictDialogProps = {
    hasDeleteCandidate: deps.currentNoteConflict?.hasDeleteCandidate ?? false,
    open: deps.chooseConflictDialogOpen,
    pending: deps.isResolveConflictPending,
    onOpenChange(open: boolean) {
      deps.setChooseConflictDialogOpen(open);
      if (!open) {
        deps.setChooseConflictNoteId(null);
      }
    },
    onKeepDeleted() {
      void deps.handleResolveCurrentNoteConflict("keep_deleted");
    },
    onRestore() {
      void deps.handleResolveCurrentNoteConflict("restore");
    },
    onMerge() {
      void deps.handleResolveCurrentNoteConflict("merge");
    },
  };

  const noteHistoryDialogProps = {
    noteId: deps.currentNoteId,
    open: deps.noteHistoryDialogOpen,
    pending: deps.isRestoreHistoryPending,
    selectedSnapshotId: deps.selectedHistorySnapshotId,
    snapshots: deps.currentNoteHistory?.snapshots ?? [],
    hasConflict: deps.isCurrentNoteConflicted,
    onOpenChange(open: boolean) {
      deps.setNoteHistoryDialogOpen(open);
      if (!open) {
        deps.setUserHistorySnapshotId(null);
      }
    },
    onRestore() {
      void deps.handleRestoreSelectedNoteHistorySnapshot();
    },
    onSelectSnapshot(snapshotId: string) {
      deps.handleSelectNoteHistorySnapshot(snapshotId);
    },
  };

  return {
    publishDialogProps,
    publishShortNoteDialogProps,
    deletePublishDialogProps,
    chooseConflictDialogProps,
    noteHistoryDialogProps,
  };
}
