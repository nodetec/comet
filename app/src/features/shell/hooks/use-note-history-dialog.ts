import { useEffect, useState } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { toastErrorHandler } from "@/shared/lib/mutation-utils";
import type {
  LoadedNote,
  NoteHistoryInfo,
  WikiLinkResolutionInput,
} from "@/shared/api/types";
import type { DraftControl } from "@/features/shell/hooks/use-draft-control";

export interface NoteHistoryDialogDeps {
  draftControl: DraftControl;
  currentNoteId: string | null;
  currentNoteHistory: NoteHistoryInfo | undefined;
  isCurrentNoteConflicted: boolean;
  queryClient: QueryClient;
  saveNoteMutation: {
    mutateAsync: (input: {
      id: string;
      markdown: string;
      wikilinkResolutions?: WikiLinkResolutionInput[];
    }) => Promise<{ note: LoadedNote }>;
  };
  setDraft: (
    noteId: string,
    markdown: string,
    options?: {
      preserveWikilinkResolutions?: boolean;
      wikilinkResolutions?: WikiLinkResolutionInput[];
    },
  ) => void;
}

export function useNoteHistoryDialog(deps: NoteHistoryDialogDeps) {
  const [noteHistoryDialogOpen, setNoteHistoryDialogOpen] = useState(false);
  const [selectedHistorySnapshotId, setSelectedHistorySnapshotId] = useState<
    string | null
  >(null);
  const [isRestoreHistoryPending, setIsRestoreHistoryPending] = useState(false);

  // Auto-select history snapshot
  useEffect(() => {
    if (!noteHistoryDialogOpen) {
      setSelectedHistorySnapshotId(null);
      return;
    }

    if (!deps.currentNoteId) {
      setNoteHistoryDialogOpen(false);
      setSelectedHistorySnapshotId(null);
      return;
    }

    if (
      !deps.currentNoteHistory ||
      deps.currentNoteHistory.snapshotCount === 0
    ) {
      setSelectedHistorySnapshotId(null);
      return;
    }

    if (
      selectedHistorySnapshotId &&
      deps.currentNoteHistory.snapshots.some(
        (snapshot) => snapshot.snapshotId === selectedHistorySnapshotId,
      )
    ) {
      return;
    }

    setSelectedHistorySnapshotId(
      deps.currentNoteHistory.snapshots.find((snapshot) => snapshot.isCurrent)
        ?.snapshotId ??
        deps.currentNoteHistory.snapshots[0]?.snapshotId ??
        null,
    );
  }, [
    deps.currentNoteHistory,
    deps.currentNoteId,
    noteHistoryDialogOpen,
    selectedHistorySnapshotId,
  ]);

  const handleOpenNoteHistory = () => {
    if (!deps.currentNoteId) {
      return;
    }
    setNoteHistoryDialogOpen(true);
  };

  const handleSelectNoteHistorySnapshot = (snapshotId: string) => {
    setSelectedHistorySnapshotId(snapshotId);
  };

  const handleRestoreSelectedNoteHistorySnapshot = async () => {
    if (
      !deps.currentNoteId ||
      !deps.currentNoteHistory ||
      !selectedHistorySnapshotId
    ) {
      return;
    }

    if (deps.isCurrentNoteConflicted) {
      toast.error(
        "Resolve the current note conflict before restoring history.",
        {
          id: "restore-history-conflict-error",
        },
      );
      return;
    }

    const snapshot = deps.currentNoteHistory.snapshots.find(
      (entry) => entry.snapshotId === selectedHistorySnapshotId,
    );
    if (!snapshot || snapshot.op === "del" || !snapshot.markdown) {
      return;
    }

    setIsRestoreHistoryPending(true);
    try {
      deps.draftControl.discardPendingSave();
      const { note: savedNote } = await deps.saveNoteMutation.mutateAsync({
        id: deps.currentNoteId,
        markdown: snapshot.markdown,
        wikilinkResolutions: snapshot.wikilinkResolutions,
      });
      deps.setDraft(deps.currentNoteId, snapshot.markdown, {
        wikilinkResolutions: savedNote.wikilinkResolutions,
      });
      setNoteHistoryDialogOpen(false);
      toast.success("Snapshot restored.", {
        id: "restore-history-success",
      });
      await Promise.all([
        deps.queryClient.invalidateQueries({
          queryKey: ["note", deps.currentNoteId],
        }),
        deps.queryClient.invalidateQueries({
          queryKey: ["note-history", deps.currentNoteId],
        }),
        deps.queryClient.invalidateQueries({ queryKey: ["notes"] }),
        deps.queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      ]);
    } catch (error) {
      toastErrorHandler(
        "Couldn't restore snapshot",
        "restore-history-error",
      )(error);
    } finally {
      setIsRestoreHistoryPending(false);
    }
  };

  return {
    noteHistoryDialogOpen,
    selectedHistorySnapshotId,
    isRestoreHistoryPending,
    setNoteHistoryDialogOpen,
    setSelectedHistorySnapshotId,
    handleOpenNoteHistory,
    handleSelectNoteHistorySnapshot,
    handleRestoreSelectedNoteHistorySnapshot,
  };
}
