import { type RefObject, useEffect, useRef, useState } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { toastErrorHandler } from "@/shared/lib/mutation-utils";
import { resolveNoteConflict } from "@/shared/api/invoke";
import type {
  LoadedNote,
  NoteConflictInfo,
  ResolveNoteConflictAction,
  WikiLinkResolutionInput,
} from "@/shared/api/types";

export interface ConflictResolutionDeps {
  currentNote: LoadedNote | undefined;
  currentNoteConflict: NoteConflictInfo | null | undefined;
  isCurrentNoteConflicted: boolean;
  draftNoteId: string | null;
  draftMarkdown: string;
  draftWikilinkResolutions: WikiLinkResolutionInput[];
  hasPendingWikilinkResolutionChanges: boolean;
  selectedNoteId: string | null;
  pendingSaveTimeoutRef: RefObject<number | null>;
  queryClient: QueryClient;
  setDraft: (
    noteId: string,
    markdown: string,
    options?: {
      preserveWikilinkResolutions?: boolean;
      wikilinkResolutions?: WikiLinkResolutionInput[];
    },
  ) => void;
  bumpSyncEditorRevision: (
    reason: string,
    details?: Record<string, unknown>,
  ) => void;
}

export function useConflictResolution(deps: ConflictResolutionDeps) {
  const {
    currentNote,
    currentNoteConflict,
    isCurrentNoteConflicted,
    draftNoteId,
    draftMarkdown,
    draftWikilinkResolutions,
    hasPendingWikilinkResolutionChanges,
    selectedNoteId,
    pendingSaveTimeoutRef,
    queryClient,
    setDraft,
    bumpSyncEditorRevision,
  } = deps;

  const [chooseConflictDialogOpen, setChooseConflictDialogOpen] =
    useState(false);
  const [chooseConflictNoteId, setChooseConflictNoteId] = useState<
    string | null
  >(null);
  const [selectedConflictSnapshotId, setSelectedConflictSnapshotId] = useState<
    string | null
  >(null);
  const [isResolveConflictPending, setIsResolveConflictPending] =
    useState(false);
  const previousConflictNoteIdRef = useRef<string | null>(null);

  // Reset draft when note becomes conflicted
  useEffect(() => {
    if (!currentNote) {
      previousConflictNoteIdRef.current = null;
      setSelectedConflictSnapshotId(null);
      return;
    }

    const conflictNoteId = isCurrentNoteConflicted ? currentNote.id : null;
    const justBecameConflicted =
      conflictNoteId !== null &&
      previousConflictNoteIdRef.current !== conflictNoteId;
    previousConflictNoteIdRef.current = conflictNoteId;

    if (!justBecameConflicted) {
      return;
    }

    if (pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }

    if (
      draftNoteId === currentNote.id &&
      (draftMarkdown !== currentNote.markdown ||
        hasPendingWikilinkResolutionChanges)
    ) {
      setDraft(currentNote.id, currentNote.markdown, {
        wikilinkResolutions: currentNote.wikilinkResolutions,
      });
      bumpSyncEditorRevision("conflict-reset-to-current-note", {
        draftLength: draftMarkdown.length,
        noteId: currentNote.id,
        noteLength: currentNote.markdown.length,
      });
    }
  }, [
    bumpSyncEditorRevision,
    currentNote,
    draftMarkdown,
    draftNoteId,
    hasPendingWikilinkResolutionChanges,
    isCurrentNoteConflicted,
    pendingSaveTimeoutRef,
    setDraft,
  ]);

  // Auto-select conflict snapshot
  useEffect(() => {
    if (!currentNote || !currentNoteConflict || !isCurrentNoteConflicted) {
      setSelectedConflictSnapshotId(null);
      return;
    }

    if (
      selectedConflictSnapshotId &&
      currentNoteConflict.snapshots.some(
        (snapshot) => snapshot.snapshotId === selectedConflictSnapshotId,
      )
    ) {
      return;
    }

    setSelectedConflictSnapshotId(
      currentNoteConflict.currentSnapshotId ??
        currentNoteConflict.snapshots[0]?.snapshotId ??
        null,
    );
  }, [
    currentNote,
    currentNoteConflict,
    isCurrentNoteConflicted,
    selectedConflictSnapshotId,
  ]);

  // Close dialog if note is no longer conflicted
  useEffect(() => {
    if (!chooseConflictDialogOpen) {
      return;
    }

    if (
      !currentNote ||
      !isCurrentNoteConflicted ||
      chooseConflictNoteId !== currentNote.id
    ) {
      setChooseConflictDialogOpen(false);
      setChooseConflictNoteId(null);
    }
  }, [
    chooseConflictDialogOpen,
    chooseConflictNoteId,
    currentNote,
    isCurrentNoteConflicted,
  ]);

  const handleResolveCurrentNoteConflict = async (
    action: ResolveNoteConflictAction,
  ) => {
    const resolvedNoteId =
      currentNote?.id ?? chooseConflictNoteId ?? selectedNoteId;
    if (
      (!currentNote || !resolvedNoteId) &&
      (action === "restore" || action === "merge")
    ) {
      return;
    }

    setIsResolveConflictPending(true);
    const preferredResolutionMarkdown =
      currentNote && draftNoteId === currentNote.id
        ? draftMarkdown
        : currentNote?.markdown;
    const resolutionMarkdown =
      action === "keep_deleted" ? undefined : preferredResolutionMarkdown;
    const resolutionWikilinkResolutions =
      action === "keep_deleted" ||
      !currentNote ||
      draftNoteId !== currentNote.id ||
      draftWikilinkResolutions.length === 0
        ? undefined
        : draftWikilinkResolutions;
    try {
      await resolveNoteConflict(
        resolvedNoteId ?? "",
        action,
        resolutionMarkdown,
        action === "keep_deleted"
          ? undefined
          : (selectedConflictSnapshotId ?? undefined),
        resolutionWikilinkResolutions,
      );
      setChooseConflictDialogOpen(false);
      setChooseConflictNoteId(null);
      setSelectedConflictSnapshotId(null);
      toast.success("Conflict resolution published.", {
        id: "resolve-note-conflict-success",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["note", resolvedNoteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["note-conflict", resolvedNoteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["note-backlinks", resolvedNoteId],
        }),
        queryClient.invalidateQueries({ queryKey: ["notes"] }),
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      ]);
    } catch (error) {
      toastErrorHandler(
        "Couldn't resolve note conflict",
        "resolve-note-conflict-error",
      )(error);
    } finally {
      setIsResolveConflictPending(false);
    }
  };

  const handleLoadConflictHead = (
    snapshotId: string,
    markdown: string | null,
  ) => {
    if (!currentNote) {
      return;
    }
    setSelectedConflictSnapshotId(snapshotId);
    if (markdown !== null) {
      const snapshot = currentNoteConflict?.snapshots.find(
        (entry) => entry.snapshotId === snapshotId,
      );
      setDraft(currentNote.id, markdown, {
        wikilinkResolutions: snapshot?.wikilinkResolutions ?? [],
      });
      bumpSyncEditorRevision("load-conflict-snapshot", {
        noteId: currentNote.id,
        snapshotId,
        markdownLength: markdown.length,
      });
    }
  };

  return {
    chooseConflictDialogOpen,
    chooseConflictNoteId,
    selectedConflictSnapshotId,
    isResolveConflictPending,
    setChooseConflictDialogOpen,
    setChooseConflictNoteId,
    handleResolveCurrentNoteConflict,
    handleLoadConflictHead,
  };
}
