import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/shared/lib/utils";
import {
  useActiveTagPath,
  useCreatingSelectedNoteId,
  useDraftMarkdown,
  useDraftNoteId,
  useDraftWikilinkResolutions,
  useIsCreatingNoteTransition,
  useNoteFilter,
  usePendingAutoFocusEditorNoteId,
  useSearchQuery,
  useSelectedNoteId,
  useShellActions,
  useTagViewActive,
} from "@/features/shell/store/use-shell-store";
import {
  defaultNoteSortPrefs,
  useNoteSortPrefs,
} from "@/features/settings/store/use-ui-store";

import {
  type PublishNoteInput,
  type PublishShortNoteInput,
} from "@/shared/api/types";
import { usePublishState } from "@/features/publishing";

import { useNoteQueries } from "@/features/notes-pane/hooks/use-note-queries";
import { useNoteMutations } from "@/features/notes-pane/hooks/use-note-mutations";
import { useDraftPersistence } from "@/features/shell/hooks/use-draft-persistence";
import { useDraftControl } from "@/features/shell/hooks/use-draft-control";
import { useConflictResolution } from "@/features/shell/hooks/use-conflict-resolution";
import { useNoteHistoryDialog } from "@/features/shell/hooks/use-note-history-dialog";
import { useNoteOperations } from "@/features/shell/hooks/use-note-operations";
import { useShellEffects } from "@/features/shell/hooks/use-shell-effects";
import { useTagOperations } from "@/features/shell/hooks/use-tag-operations";
import { useViewNavigation } from "@/features/shell/hooks/use-view-navigation";
import { haveSameWikilinkResolutions } from "@/shared/lib/wikilink-resolutions";

export function useShellController() {
  const [hasHydratedInitialSelection, setHasHydratedInitialSelection] =
    useState(false);
  const [syncEditorRevision, setSyncEditorRevision] = useState(0);

  const publish = usePublishState();
  const {
    deletePublishDialogOpen,
    deletePublishedNoteMutation,
    publishDialogOpen,
    publishNoteMutation,
    publishShortNoteDialogOpen,
    publishShortNoteMutation,
    setDeletePublishDialogOpen,
    setPublishDialogOpen,
    setPublishShortNoteDialogOpen,
  } = publish;
  const {
    isPending: isDeletePublishedNotePending,
    mutate: mutateDeletePublishedNote,
  } = deletePublishedNoteMutation;
  const { isPending: isPublishNotePending, mutate: mutatePublishNote } =
    publishNoteMutation;
  const {
    isPending: isPublishShortNotePending,
    mutate: mutatePublishShortNote,
  } = publishShortNoteMutation;
  const pendingSaveTimeoutRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);

  const queryClient = useQueryClient();
  const activeTagPath = useActiveTagPath();
  const creatingSelectedNoteId = useCreatingSelectedNoteId();
  const draftMarkdown = useDraftMarkdown();
  const draftNoteId = useDraftNoteId();
  const draftWikilinkResolutions = useDraftWikilinkResolutions();
  const isCreatingNoteTransition = useIsCreatingNoteTransition();
  const noteFilter = useNoteFilter();
  const searchQuery = useSearchQuery();
  const pendingAutoFocusEditorNoteId = usePendingAutoFocusEditorNoteId();
  const selectedNoteId = useSelectedNoteId();
  const tagViewActive = useTagViewActive();
  const {
    clearDraftWikilinkResolutions,
    setActiveTagPath,
    setDraft,
    setNoteFilter,
    setPendingAutoFocusEditorNoteId,
    setSelectedNoteId,
    setTagViewActive,
  } = useShellActions();

  const effectiveNoteFilter = tagViewActive ? "all" : noteFilter;
  const allSortPrefs = useNoteSortPrefs();
  const sortPrefs = allSortPrefs[effectiveNoteFilter] ?? defaultNoteSortPrefs;
  const noteSortField = sortPrefs.field;
  const noteSortDirection = sortPrefs.direction;

  const bumpSyncEditorRevision = (
    _reason: string,
    _details: Record<string, unknown> = {},
  ) => {
    setSyncEditorRevision((value) => value + 1);
  };

  // --- Queries ---
  const {
    bootstrapQuery,
    todoCountQuery,
    notesQuery,
    noteQuery,
    noteConflictQuery,
    noteHistoryQuery,
    noteBacklinksQuery,
    currentNotes,
    availableTagPaths,
    availableTagTree,
    totalNoteCount,
    activeNpub,
    initialSelectedNoteId,
  } = useNoteQueries({
    noteFilter,
    activeTagPath,
    tagViewActive,
    searchQuery,
    sortField: noteSortField,
    sortDirection: noteSortDirection,
    selectedNoteId,
  });

  // --- Mutations ---
  const {
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
  } = useNoteMutations({
    queryClient,
    currentNotes,
    selectedNoteId,
    draftNoteId,
    draftMarkdown,
    noteFilter: effectiveNoteFilter,
    activeNpub,
    isSavingRef,
    clearDraftWikilinkResolutions,
    setSelectedNoteId,
    setDraft,
    setNoteFilter,
  });

  const { isPending: saveNotePending, mutate: mutateSaveNote } =
    saveNoteMutation;

  const currentNote = selectedNoteId ? noteQuery.data : undefined;
  const currentNoteId = currentNote?.id ?? null;
  const currentNoteConflict = selectedNoteId
    ? noteConflictQuery.data
    : undefined;
  const currentNoteHistory = selectedNoteId ? noteHistoryQuery.data : undefined;
  const isCurrentNoteConflicted = (currentNoteConflict?.snapshotCount ?? 0) > 1;
  const hasPendingWikilinkResolutionChanges = currentNote
    ? !haveSameWikilinkResolutions(
        draftWikilinkResolutions,
        currentNote.wikilinkResolutions,
      )
    : draftWikilinkResolutions.length > 0;
  const readyToRevealWindow =
    bootstrapQuery.isError ||
    (bootstrapQuery.isSuccess &&
      hasHydratedInitialSelection &&
      (!selectedNoteId || currentNote?.id === selectedNoteId));
  const isCreatingNote =
    isCreatingNoteTransition || createNoteMutation.isPending;
  const displayedSelectedNoteId = isCreatingNote
    ? creatingSelectedNoteId
    : selectedNoteId;
  let currentEditorMarkdown = "";
  if (currentNote) {
    currentEditorMarkdown =
      draftNoteId === currentNote.id ? draftMarkdown : currentNote.markdown;
  }

  // --- Draft control ---
  const draftControl = useDraftControl({
    currentNote,
    draftNoteId,
    draftMarkdown,
    draftWikilinkResolutions,
    isCurrentNoteConflicted,
    hasPendingWikilinkResolutionChanges,
    pendingSaveTimeoutRef,
    saveNoteMutation,
  });
  const { flushCurrentDraft, flushCurrentDraftAsync } = draftControl;

  // --- Draft persistence ---
  useDraftPersistence({
    activeNpub,
    bootstrapNpub: bootstrapQuery.data?.npub,
    bootstrapReady: bootstrapQuery.isSuccess,
    currentNote,
    draftNoteId,
    draftMarkdown,
    draftWikilinkResolutions,
    isCurrentNoteConflicted,
    saveNotePending,
    mutateSaveNote,
    pendingSaveTimeoutRef,
    queryClient,
  });

  // --- Conflict resolution ---
  const conflictResolution = useConflictResolution({
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
  });
  const {
    chooseConflictDialogOpen,
    selectedConflictSnapshotId,
    isResolveConflictPending,
    setChooseConflictDialogOpen,
    setChooseConflictNoteId,
  } = conflictResolution;

  // --- Note history dialog ---
  const noteHistory = useNoteHistoryDialog({
    draftControl,
    currentNoteId,
    currentNoteHistory,
    isCurrentNoteConflicted,
    queryClient,
    saveNoteMutation,
    setDraft,
  });
  const {
    noteHistoryDialogOpen,
    selectedHistorySnapshotId,
    isRestoreHistoryPending,
    setNoteHistoryDialogOpen,
    setUserHistorySnapshotId,
  } = noteHistory;

  // --- Note operations ---
  const noteOps = useNoteOperations({
    draftControl,
    selectedNoteId,
    draftNoteId,
    draftMarkdown,
    queryClient,
    activeTagPath,
    tagViewActive,
    noteFilter: effectiveNoteFilter,
    currentNote,
    archiveNoteMutation,
    restoreNoteMutation,
    trashNoteMutation,
    restoreFromTrashMutation,
    deleteNotePermanentlyMutation,
    emptyTrashMutation,
    pinNoteMutation,
    unpinNoteMutation,
    duplicateNoteMutation,
    setNoteReadonlyMutation,
  });

  // --- Tag operations ---
  const tagOps = useTagOperations({
    draftControl,
    currentNote,
    isCurrentNoteConflicted,
    draftNoteId,
    selectedNoteId,
    activeTagPath,
    queryClient,
    invalidateNotes,
    invalidateContextualTags,
    setDraft,
    setActiveTagPath,
    setTagViewActive,
    bumpSyncEditorRevision,
  });

  // --- View navigation ---
  const viewNav = useViewNavigation({
    activeTagPath,
    tagViewActive,
    noteFilter,
    effectiveNoteFilter,
    selectedNoteId,
    currentNote,
    isCreatingNote,
    draftControl,
    createNoteMutation,
  });

  useShellEffects({
    queryClient,
    pendingSaveTimeoutRef,
    isSavingRef,
    bumpSyncEditorRevision,
    activeTagPath,
    availableTagPaths,
    selectedNoteId,
    draftNoteId,
    noteQueryData: noteQuery.data,
    noteQueryIsPlaceholderData: noteQuery.isPlaceholderData,
    bootstrapSuccess: bootstrapQuery.isSuccess,
    initialSelectedNoteId,
    hasHydratedInitialSelection,
    isCreatingNoteTransition,
    createNoteMutation,
    setActiveTagPath,
    setDraft,
    setHasHydratedInitialSelection,
    setSelectedNoteId,
    tagViewActive,
    noteFilter,
    isCreatingNote,
    setTagViewActive,
    flushCurrentDraft,
    flushCurrentDraftAsync,
    handleSelectTagPath: viewNav.handleSelectTagPath,
    handleSelectNote: viewNav.handleSelectNote,
  });

  // --- Props assembly ---
  const nextEditorPaneProps = {
    availableTagPaths,
    archivedAt: currentNote?.archivedAt ?? null,
    autoFocusEditor: currentNoteId === pendingAutoFocusEditorNoteId,
    backlinks: noteBacklinksQuery.data ?? [],
    deletedAt: currentNote?.deletedAt ?? null,
    markdown: currentEditorMarkdown,
    modifiedAt: currentNote?.modifiedAt ?? 0,
    noteConflict: currentNoteConflict ?? null,
    noteId:
      displayedSelectedNoteId || isCreatingNote
        ? (currentNote?.id ?? null)
        : null,
    editorKey: currentNote ? `${currentNote.id}-${syncEditorRevision}` : null,
    pinnedAt: currentNote?.pinnedAt ?? null,
    publishedAt: currentNote?.publishedAt ?? null,
    publishedKind: currentNote?.publishedKind ?? null,
    readonly: currentNote?.readonly ?? false,
    selectedConflictSnapshotId,
    searchQuery,
    isDeletePublishedNotePending,
    isResolveConflictPending,
    onDeletePublishedNote() {
      if (
        !currentNote ||
        isDeletePublishedNotePending ||
        !currentNote.publishedAt
      ) {
        return;
      }

      setDeletePublishDialogOpen(true);
    },
    onDuplicateNote() {
      if (currentNote) {
        noteOps.handleDuplicateNote(currentNote.id);
      }
    },
    onAutoFocusEditorHandled() {
      if (currentNoteId === pendingAutoFocusEditorNoteId) {
        setPendingAutoFocusEditorNoteId(null);
      }
    },
    onOpenPublishDialog() {
      if (!currentNote || isPublishNotePending) {
        return;
      }

      void (async () => {
        await flushCurrentDraftAsync();
        setPublishDialogOpen(true);
      })().catch(() => {});
    },
    onPublishShortNote() {
      if (!currentNote || isPublishShortNotePending) {
        return;
      }

      void (async () => {
        await flushCurrentDraftAsync();
        setPublishShortNoteDialogOpen(true);
      })().catch(() => {});
    },
    onSetPinned(pinned: boolean) {
      if (currentNote) {
        noteOps.handleSetNotePinned(currentNote.id, pinned);
      }
    },
    onSetReadonly(readonly: boolean) {
      if (currentNote) {
        noteOps.handleSetNoteReadonly(currentNote.id, readonly);
      }
    },
    onChange(markdown: string) {
      if (currentNote && !currentNote.archivedAt && !currentNote.readonly) {
        setDraft(currentNote.id, markdown, {
          preserveWikilinkResolutions: true,
        });
      }
    },
    onLoadConflictHead(snapshotId: string, markdown: string | null) {
      conflictResolution.handleLoadConflictHead(snapshotId, markdown);
    },
    onSelectLinkedNote(noteId: string) {
      viewNav.handleSelectNote(noteId);
    },
    onResolveConflict() {
      setChooseConflictNoteId(currentNote?.id ?? null);
      setChooseConflictDialogOpen(true);
    },
    onOpenHistory() {
      noteHistory.handleOpenNoteHistory();
    },
  };

  // Freeze editor pane props while React Query is showing placeholder data
  // from the previous note, so the old note's content doesn't flash.
  const holdPreviousEditorPane =
    noteQuery.isPlaceholderData && selectedNoteId !== null;
  const editorPanePropsRef = useRef(nextEditorPaneProps);
  if (!holdPreviousEditorPane) {
    editorPanePropsRef.current = nextEditorPaneProps;
  }
  const editorPaneProps = holdPreviousEditorPane
    ? editorPanePropsRef.current
    : nextEditorPaneProps;

  const publishDialogProps = {
    content: currentEditorMarkdown,
    initialTitle: currentNote?.title ?? "",
    initialTags: currentNote?.tags ?? [],
    noteId: currentNote?.id ?? "",
    open: publishDialogOpen,
    pending: isPublishNotePending,
    onOpenChange: setPublishDialogOpen,
    onSubmit(input: PublishNoteInput) {
      mutatePublishNote(input);
    },
  };

  const publishShortNoteDialogProps = {
    content: currentEditorMarkdown.replace(/^#\s+.*\n*/, "").trim(),
    initialTags: currentNote?.tags ?? [],
    noteId: currentNote?.id ?? "",
    open: publishShortNoteDialogOpen,
    pending: isPublishShortNotePending,
    onOpenChange: setPublishShortNoteDialogOpen,
    onSubmit(input: PublishShortNoteInput) {
      mutatePublishShortNote(input);
    },
  };

  const deletePublishDialogProps = {
    open: deletePublishDialogOpen,
    pending: isDeletePublishedNotePending,
    onOpenChange: setDeletePublishDialogOpen,
    onConfirm() {
      if (currentNoteId) {
        mutateDeletePublishedNote(currentNoteId);
      }
    },
  };

  const chooseConflictDialogProps = {
    hasDeleteCandidate: currentNoteConflict?.hasDeleteCandidate ?? false,
    open: chooseConflictDialogOpen,
    pending: isResolveConflictPending,
    onOpenChange(open: boolean) {
      setChooseConflictDialogOpen(open);
      if (!open) {
        setChooseConflictNoteId(null);
      }
    },
    onKeepDeleted() {
      void conflictResolution.handleResolveCurrentNoteConflict("keep_deleted");
    },
    onRestore() {
      void conflictResolution.handleResolveCurrentNoteConflict("restore");
    },
    onMerge() {
      void conflictResolution.handleResolveCurrentNoteConflict("merge");
    },
  };

  const noteHistoryDialogProps = {
    noteId: currentNoteId,
    open: noteHistoryDialogOpen,
    pending: isRestoreHistoryPending,
    selectedSnapshotId: selectedHistorySnapshotId,
    snapshots: currentNoteHistory?.snapshots ?? [],
    hasConflict: isCurrentNoteConflicted,
    onOpenChange(open: boolean) {
      setNoteHistoryDialogOpen(open);
      if (!open) {
        setUserHistorySnapshotId(null);
      }
    },
    onRestore() {
      void noteHistory.handleRestoreSelectedNoteHistorySnapshot();
    },
    onSelectSnapshot(snapshotId: string) {
      noteHistory.handleSelectNoteHistorySnapshot(snapshotId);
    },
  };

  const { isMutatingNote } = noteOps;

  const notesPaneProps = {
    filteredNotes: currentNotes,
    hasMoreNotes: notesQuery.hasNextPage,
    isCreatingNote,
    isLoadingMoreNotes: notesQuery.isFetchingNextPage,
    isNotesPlaceholderData: notesQuery.isPlaceholderData,
    isMutatingNote,
    selectedNoteId: displayedSelectedNoteId,
    totalNoteCount,
    onArchiveNote: noteOps.handleArchiveNote,
    onCopyNoteContent: noteOps.handleCopyNoteContent,
    onCreateNote: viewNav.handleCreateNote,
    onDeleteNotePermanently: noteOps.handleDeleteNotePermanently,
    onDuplicateNote: noteOps.handleDuplicateNote,
    onExportNotes: noteOps.handleExportNotes,
    onLoadMore() {
      if (notesQuery.hasNextPage && !notesQuery.isFetchingNextPage) {
        void notesQuery.fetchNextPage();
      }
    },
    onRestoreFromTrash: noteOps.handleRestoreFromTrash,
    onRestoreNote: noteOps.handleRestoreNote,
    onSelectNote: viewNav.handleSelectNote,
    onSetNotePinned: noteOps.handleSetNotePinned,
    onSetNoteReadonly: noteOps.handleSetNoteReadonly,
    onTrashNote: noteOps.handleTrashNote,
  };

  const sidebarPaneProps = {
    availableTagPaths,
    availableTagTree,
    archivedCount: bootstrapQuery.data?.archivedCount ?? 0,
    todoCount: todoCountQuery.data ?? 0,
    trashedCount: bootstrapQuery.data?.trashedCount ?? 0,
    onSelectAll: viewNav.handleSelectAll,
    onSelectToday: viewNav.handleSelectToday,
    onSelectTodo: viewNav.handleSelectTodo,
    onSelectPinned: viewNav.handleSelectPinned,
    onSelectUntagged: viewNav.handleSelectUntagged,
    onSelectArchive: viewNav.handleSelectArchive,
    onSelectTrash: viewNav.handleSelectTrash,
    onSelectTagPath: viewNav.handleSelectTagPath,
    onDeleteTag: tagOps.handleDeleteTag,
    onEmptyTrash: noteOps.handleEmptyTrash,
    onExportTag: noteOps.handleExportTag,
    onRenameTag: tagOps.handleRenameTag,
    onSetTagPinned: tagOps.handleSetTagPinned,
    onSetTagHideSubtagNotes: tagOps.handleSetHideSubtagNotes,
  };

  return {
    bootstrapError: bootstrapQuery.isError
      ? errorMessage(bootstrapQuery.error, "Failed to load the note library.")
      : null,
    bootstrapLoading: bootstrapQuery.isLoading,
    readyToRevealWindow,
    retryBootstrap() {
      void bootstrapQuery.refetch();
      void invalidateNotes();
      void invalidateContextualTags();
    },
    editorPaneProps,
    publishDialogProps,
    publishShortNoteDialogProps,
    deletePublishDialogProps,
    chooseConflictDialogProps,
    noteHistoryDialogProps,
    notesPaneProps,
    sidebarPaneProps,
  };
}
