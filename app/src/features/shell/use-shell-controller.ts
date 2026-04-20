import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { usePublishState } from "@/features/publishing";
import {
  defaultNoteSortPrefs,
  useNoteSortPrefs,
} from "@/shared/stores/use-ui-store";
import { useConflictResolution } from "@/features/shell/hooks/use-conflict-resolution";
import { useDraftControl } from "@/features/shell/hooks/use-draft-control";
import { useDraftPersistence } from "@/features/shell/hooks/use-draft-persistence";
import { useEditorPaneModel } from "@/features/shell/hooks/use-editor-pane-model";
import { useNoteHistoryDialog } from "@/features/shell/hooks/use-note-history-dialog";
import { useNotesPaneModel } from "@/features/shell/hooks/use-notes-pane-model";
import { useNoteOperations } from "@/features/shell/hooks/use-note-operations";
import { useShellData } from "@/features/shell/hooks/use-shell-data";
import { useShellDerivedState } from "@/features/shell/hooks/use-shell-derived-state";
import { useShellDialogModels } from "@/features/shell/hooks/use-shell-dialog-models";
import { useShellEffects } from "@/features/shell/hooks/use-shell-effects";
import { useDraftStore } from "@/shared/stores/use-draft-store";
import { useNavigationStore } from "@/shared/stores/use-navigation-store";
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
  useTagViewActive,
} from "@/shared/stores/use-app-state";
import { useSidebarPaneModel } from "@/features/shell/hooks/use-sidebar-pane-model";
import { useTagOperations } from "@/features/shell/hooks/use-tag-operations";
import { useViewNavigation } from "@/features/shell/hooks/use-view-navigation";
import { errorMessage } from "@/shared/lib/utils";

export function useShellController() {
  const [hasHydratedInitialSelection, setHasHydratedInitialSelection] =
    useState(false);
  const [syncEditorRevision, setSyncEditorRevision] = useState(0);
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
  const pendingAutoFocusEditorNoteId = usePendingAutoFocusEditorNoteId();
  const searchQuery = useSearchQuery();
  const selectedNoteId = useSelectedNoteId();
  const tagViewActive = useTagViewActive();
  const { clearDraftWikilinkResolutions, setDraft } = useDraftStore(
    (state) => state.actions,
  );
  const {
    setActiveTagPath,
    setNoteFilter,
    setPendingAutoFocusEditorNoteId,
    setSelectedNoteId,
    setTagViewActive,
  } = useNavigationStore((state) => state.actions);
  const effectiveNoteFilter = tagViewActive ? "all" : noteFilter;
  const allSortPrefs = useNoteSortPrefs();
  const sortPrefs = allSortPrefs[effectiveNoteFilter] ?? defaultNoteSortPrefs;

  const bumpSyncEditorRevision = () => {
    setSyncEditorRevision((value) => value + 1);
  };

  const data = useShellData({
    activeTagPath,
    clearDraftWikilinkResolutions,
    currentNotesSelectionId: selectedNoteId,
    draftMarkdown,
    draftNoteId,
    effectiveNoteFilter,
    isSavingRef,
    noteFilter,
    queryClient,
    searchQuery,
    setDraft,
    setNoteFilter,
    setSelectedNoteId,
    sortField: sortPrefs.field,
    sortDirection: sortPrefs.direction,
    tagViewActive,
  });

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
  } = data;
  const { isPending: saveNotePending, mutate: mutateSaveNote } =
    saveNoteMutation;

  const derivedState = useShellDerivedState({
    bootstrapQuery,
    createNotePending: createNoteMutation.isPending,
    creatingSelectedNoteId,
    currentNoteQueryData: noteQuery.data,
    draftMarkdown,
    draftNoteId,
    draftWikilinkResolutions,
    hasHydratedInitialSelection,
    isCreatingNoteTransition,
    noteConflictQueryData: noteConflictQuery.data,
    noteHistoryQueryData: noteHistoryQuery.data,
    selectedNoteId,
  });
  const {
    currentNote,
    currentNoteId,
    currentNoteConflict,
    currentNoteHistory,
    currentEditorMarkdown,
    displayedSelectedNoteId,
    hasPendingWikilinkResolutionChanges,
    isCreatingNote,
    isCurrentNoteConflicted,
    readyToRevealWindow,
  } = derivedState;

  const draftControl = useDraftControl({
    queryClient,
    pendingSaveTimeoutRef,
    saveNoteMutation,
  });
  const { flushCurrentDraft, flushCurrentDraftAsync } = draftControl;

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

  const publishState = usePublishState();
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
  } = publishState;
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

  const noteOps = useNoteOperations({
    draftControl,
    queryClient,
    currentNotes,
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

  const tagOps = useTagOperations({
    draftControl,
    queryClient,
    invalidateNotes,
    invalidateContextualTags,
    setDraft,
    setActiveTagPath,
    setTagViewActive,
    bumpSyncEditorRevision,
  });

  const viewNav = useViewNavigation({
    queryClient,
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
    noteFilter,
    tagViewActive,
    isCreatingNote,
    setActiveTagPath,
    setDraft,
    setHasHydratedInitialSelection,
    setSelectedNoteId,
    setTagViewActive,
    flushCurrentDraft,
    flushCurrentDraftAsync,
    handleSelectTagPath: viewNav.handleSelectTagPath,
    handleSelectNote: viewNav.handleSelectNote,
  });

  const {
    publishDialogProps,
    publishShortNoteDialogProps,
    deletePublishDialogProps,
    chooseConflictDialogProps,
    noteHistoryDialogProps,
  } = useShellDialogModels({
    chooseConflictDialogOpen,
    currentEditorMarkdown,
    currentNote,
    currentNoteConflict,
    currentNoteHistory,
    currentNoteId,
    deletePublishDialogOpen,
    isCurrentNoteConflicted,
    isDeletePublishedNotePending,
    isPublishNotePending,
    isPublishShortNotePending,
    isResolveConflictPending,
    isRestoreHistoryPending,
    mutateDeletePublishedNote,
    mutatePublishNote,
    mutatePublishShortNote,
    noteHistoryDialogOpen,
    publishDialogOpen,
    publishShortNoteDialogOpen,
    selectedHistorySnapshotId,
    setChooseConflictDialogOpen,
    setChooseConflictNoteId,
    setDeletePublishDialogOpen,
    setNoteHistoryDialogOpen,
    setPublishDialogOpen,
    setPublishShortNoteDialogOpen,
    setUserHistorySnapshotId,
    handleResolveCurrentNoteConflict:
      conflictResolution.handleResolveCurrentNoteConflict,
    handleRestoreSelectedNoteHistorySnapshot:
      noteHistory.handleRestoreSelectedNoteHistorySnapshot,
    handleSelectNoteHistorySnapshot:
      noteHistory.handleSelectNoteHistorySnapshot,
  });

  const editorPaneProps = useEditorPaneModel({
    availableTagPaths,
    currentEditorMarkdown,
    currentNote,
    currentNoteConflict,
    displayedSelectedNoteId,
    isCreatingNote,
    isDeletePublishedNotePending,
    isPublishNotePending,
    isPublishShortNotePending,
    isResolveConflictPending,
    noteBacklinks: noteBacklinksQuery.data,
    noteQueryIsPlaceholderData: noteQuery.isPlaceholderData,
    pendingAutoFocusEditorNoteId,
    searchQuery,
    selectedConflictSnapshotId,
    setChooseConflictDialogOpen,
    setChooseConflictNoteId,
    setDeletePublishDialogOpen,
    setDraft,
    setPendingAutoFocusEditorNoteId,
    setPublishDialogOpen,
    setPublishShortNoteDialogOpen,
    syncEditorRevision,
    flushCurrentDraftAsync,
    handleDuplicateNote: noteOps.handleDuplicateNote,
    handleLoadConflictHead: conflictResolution.handleLoadConflictHead,
    handleOpenNoteHistory: noteHistory.handleOpenNoteHistory,
    handleSelectNote: viewNav.handleSelectNote,
    handleSetNotePinned: noteOps.handleSetNotePinned,
    handleSetNoteReadonly: noteOps.handleSetNoteReadonly,
  });

  const notesPaneProps = useNotesPaneModel({
    currentNotes,
    displayedSelectedNoteId,
    hasMoreNotes: notesQuery.hasNextPage,
    isCreatingNote,
    isLoadingMoreNotes: notesQuery.isFetchingNextPage,
    isMutatingNote: noteOps.isMutatingNote,
    isNotesPlaceholderData: notesQuery.isPlaceholderData,
    totalNoteCount,
    handleArchiveNote: noteOps.handleArchiveNote,
    handleCopyNoteContent: noteOps.handleCopyNoteContent,
    handleCreateNote: viewNav.handleCreateNote,
    handleDeleteNotePermanently: noteOps.handleDeleteNotePermanently,
    handleDuplicateNote: noteOps.handleDuplicateNote,
    handleExportNotes: noteOps.handleExportNotes,
    handleLoadMoreNotes() {
      if (notesQuery.hasNextPage && !notesQuery.isFetchingNextPage) {
        void notesQuery.fetchNextPage();
      }
    },
    handleRestoreFromTrash: noteOps.handleRestoreFromTrash,
    handleRestoreNote: noteOps.handleRestoreNote,
    handleSelectNote: viewNav.handleSelectNote,
    handleSetNotePinned: noteOps.handleSetNotePinned,
    handleSetNoteReadonly: noteOps.handleSetNoteReadonly,
    handleTrashNote: noteOps.handleTrashNote,
  });

  const sidebarPaneProps = useSidebarPaneModel({
    archivedCount: bootstrapQuery.data?.archivedCount ?? 0,
    availableTagPaths,
    availableTagTree,
    todoCount: todoCountQuery.data ?? 0,
    trashedCount: bootstrapQuery.data?.trashedCount ?? 0,
    handleDeleteTag: tagOps.handleDeleteTag,
    handleEmptyTrash: noteOps.handleEmptyTrash,
    handleExportTag: noteOps.handleExportTag,
    handleRenameTag: tagOps.handleRenameTag,
    handleSelectAll: viewNav.handleSelectAll,
    handleSelectArchive: viewNav.handleSelectArchive,
    handleSelectPinned: viewNav.handleSelectPinned,
    handleSelectTagPath: viewNav.handleSelectTagPath,
    handleSelectToday: viewNav.handleSelectToday,
    handleSelectTodo: viewNav.handleSelectTodo,
    handleSelectTrash: viewNav.handleSelectTrash,
    handleSelectUntagged: viewNav.handleSelectUntagged,
    handleSetHideSubtagNotes: tagOps.handleSetHideSubtagNotes,
    handleSetTagPinned: tagOps.handleSetTagPinned,
  });

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
