import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/shared/lib/utils";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import {
  defaultNoteSortPrefs,
  useUIStore,
} from "@/features/settings/store/use-ui-store";

import {
  type NoteSortDirection,
  type NoteSortField,
  type PublishNoteInput,
  type PublishShortNoteInput,
} from "@/shared/api/types";
import { usePublishState } from "@/features/publishing";

import { useNoteQueries } from "@/features/notes-pane/hooks/use-note-queries";
import { useNoteMutations } from "@/features/notes-pane/hooks/use-note-mutations";
import { useSyncListener } from "@/features/shell/hooks/use-sync-listener";
import { useDraftPersistence } from "@/features/shell/hooks/use-draft-persistence";
import { useDraftControl } from "@/features/shell/hooks/use-draft-control";
import { useConflictResolution } from "@/features/shell/hooks/use-conflict-resolution";
import { useNoteHistoryDialog } from "@/features/shell/hooks/use-note-history-dialog";
import { useNoteOperations } from "@/features/shell/hooks/use-note-operations";
import { useTagOperations } from "@/features/shell/hooks/use-tag-operations";
import { useViewNavigation } from "@/features/shell/hooks/use-view-navigation";
import { useShellEventListeners } from "@/features/shell/hooks/use-shell-event-listeners";
import { haveSameWikilinkResolutions } from "@/shared/lib/wikilink-resolutions";

export function useShellController() {
  const [hasHydratedInitialSelection, setHasHydratedInitialSelection] =
    useState(false);
  const [isCreatingNoteTransition, setIsCreatingNoteTransition] =
    useState(false);
  const [creatingSelectedNoteId, setCreatingSelectedNoteId] = useState<
    string | null
  >(null);
  const [pendingAutoFocusEditorNoteId, setPendingAutoFocusEditorNoteId] =
    useState<string | null>(null);
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
  const activeTagPath = useShellStore((state) => state.activeTagPath);
  const draftMarkdown = useShellStore((state) => state.draftMarkdown);
  const draftNoteId = useShellStore((state) => state.draftNoteId);
  const draftWikilinkResolutions = useShellStore(
    (state) => state.draftWikilinkResolutions,
  );
  const noteFilter = useShellStore((state) => state.noteFilter);
  const searchQuery = useShellStore((state) => state.searchQuery);
  const selectedNoteId = useShellStore((state) => state.selectedNoteId);
  const tagViewActive = useShellStore((state) => state.tagViewActive);
  const setDraft = useShellStore((state) => state.setDraft);
  const clearDraftWikilinkResolutions = useShellStore(
    (state) => state.clearDraftWikilinkResolutions,
  );
  const setActiveTagPath = useShellStore((state) => state.setActiveTagPath);
  const setNoteFilter = useShellStore((state) => state.setNoteFilter);
  const setSearchQuery = useShellStore((state) => state.setSearchQuery);
  const setSelectedNoteId = useShellStore((state) => state.setSelectedNoteId);
  const setTagViewActive = useShellStore((state) => state.setTagViewActive);
  const setFocusedPane = useShellStore((state) => state.setFocusedPane);

  const effectiveNoteFilter = tagViewActive ? "all" : noteFilter;
  const visibleActiveTagPath = tagViewActive ? activeTagPath : null;
  const sortViewKey = effectiveNoteFilter;
  const sortPrefs =
    useUIStore((state) => state.noteSortPrefs[sortViewKey]) ??
    defaultNoteSortPrefs;
  const setNoteSortPrefs = useUIStore((state) => state.setNoteSortPrefs);
  const noteSortField = sortPrefs.field;
  const noteSortDirection = sortPrefs.direction;

  const bumpSyncEditorRevision = useCallback(
    (_reason: string, _details: Record<string, unknown> = {}) => {
      setSyncEditorRevision((value) => value + 1);
    },
    [],
  );

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
    setCreatingSelectedNoteId,
    setPendingAutoFocusEditorNoteId,
    setIsCreatingNoteTransition,
    setNoteFilter,
  });

  const { isPending: saveNotePending, mutate: mutateSaveNote } =
    saveNoteMutation;

  // --- Sync listener ---
  useSyncListener({
    queryClient,
    pendingSaveTimeoutRef,
    isSavingRef,
    bumpSyncEditorRevision,
  });

  // --- Active tag cleanup when available tags change ---
  useEffect(() => {
    if (!activeTagPath) {
      return;
    }

    if (!availableTagPaths.includes(activeTagPath)) {
      setActiveTagPath(null);
      setTagViewActive(false);
    }
  }, [activeTagPath, availableTagPaths, setActiveTagPath, setTagViewActive]);

  // --- Sync draft from loaded note ---
  useEffect(() => {
    if (!selectedNoteId) {
      return;
    }

    if (noteQuery.isPlaceholderData) {
      return;
    }

    if (noteQuery.data && noteQuery.data.id !== draftNoteId) {
      setDraft(noteQuery.data.id, noteQuery.data.markdown, {
        wikilinkResolutions: noteQuery.data.wikilinkResolutions,
      });
    }
  }, [
    draftNoteId,
    noteQuery.data,
    noteQuery.isPlaceholderData,
    selectedNoteId,
    setDraft,
  ]);

  // --- Hydrate initial selection ---
  useEffect(() => {
    if (
      hasHydratedInitialSelection ||
      createNoteMutation.isPending ||
      isCreatingNoteTransition
    ) {
      return;
    }

    if (initialSelectedNoteId && !selectedNoteId) {
      setSelectedNoteId(initialSelectedNoteId);
      setHasHydratedInitialSelection(true);
      return;
    }

    if (bootstrapQuery.isSuccess) {
      setHasHydratedInitialSelection(true);
    }
  }, [
    bootstrapQuery.isSuccess,
    createNoteMutation.isPending,
    hasHydratedInitialSelection,
    initialSelectedNoteId,
    isCreatingNoteTransition,
    selectedNoteId,
    setSelectedNoteId,
  ]);

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
    setSelectedHistorySnapshotId,
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
    setCreatingSelectedNoteId,
    setIsCreatingNoteTransition,
    setPendingAutoFocusEditorNoteId,
    setSearchQuery,
    setNoteFilter,
  });

  // Keep latest handler references for stable memoized callbacks
  const currentHandlers = {
    fetchNextPage: notesQuery.fetchNextPage,
    flushCurrentDraft,
    flushCurrentDraftAsync,
    handleArchiveNote: noteOps.handleArchiveNote,
    handleCopyNoteContent: noteOps.handleCopyNoteContent,
    handleCreateNote: viewNav.handleCreateNote,
    handleDuplicateNote: noteOps.handleDuplicateNote,
    handleDeleteNotePermanently: noteOps.handleDeleteNotePermanently,
    handleEmptyTrash: noteOps.handleEmptyTrash,
    handleExportNotes: noteOps.handleExportNotes,
    handleExportTag: noteOps.handleExportTag,
    handleRestoreFromTrash: noteOps.handleRestoreFromTrash,
    handleRestoreNote: noteOps.handleRestoreNote,
    handleDeleteTag: tagOps.handleDeleteTag,
    handleSelectAll: viewNav.handleSelectAll,
    handleSelectArchive: viewNav.handleSelectArchive,
    handleSelectTrash: viewNav.handleSelectTrash,
    handleTrashNote: noteOps.handleTrashNote,
    handleRenameTag: tagOps.handleRenameTag,
    handleSelectNote: viewNav.handleSelectNote,
    handleSetHideSubtagNotes: tagOps.handleSetHideSubtagNotes,
    handleSetTagPinned: tagOps.handleSetTagPinned,
    handleSelectToday: viewNav.handleSelectToday,
    handleSelectTodo: viewNav.handleSelectTodo,
    handleSelectPinned: viewNav.handleSelectPinned,
    handleSelectUntagged: viewNav.handleSelectUntagged,
    handleSetNotePinned: noteOps.handleSetNotePinned,
    handleSetNoteReadonly: noteOps.handleSetNoteReadonly,
    handleSelectTagPath: viewNav.handleSelectTagPath,
    handleOpenNoteHistory: noteHistory.handleOpenNoteHistory,
    handleSelectNoteHistorySnapshot:
      noteHistory.handleSelectNoteHistorySnapshot,
    handleRestoreSelectedNoteHistorySnapshot:
      noteHistory.handleRestoreSelectedNoteHistorySnapshot,
    handleResolveCurrentNoteConflict:
      conflictResolution.handleResolveCurrentNoteConflict,
    handleLoadConflictHead: conflictResolution.handleLoadConflictHead,
  };
  const latestRef = useRef(currentHandlers);
  latestRef.current = currentHandlers;

  // --- Event listeners ---
  useShellEventListeners({
    latestRef,
    activeTagPath,
    tagViewActive,
    noteFilter,
    isCreatingNote,
    createNoteMutation,
    setNoteFilter,
    setSearchQuery,
    setCreatingSelectedNoteId,
    setIsCreatingNoteTransition,
    setFocusedPane,
  });

  // --- Props assembly ---
  const nextEditorPaneProps = useMemo(
    () => ({
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
          latestRef.current.handleDuplicateNote(currentNote.id);
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
          await latestRef.current.flushCurrentDraftAsync();
          setPublishDialogOpen(true);
        })().catch(() => {});
      },
      onPublishShortNote() {
        if (!currentNote || isPublishShortNotePending) {
          return;
        }

        void (async () => {
          await latestRef.current.flushCurrentDraftAsync();
          setPublishShortNoteDialogOpen(true);
        })().catch(() => {});
      },
      onSetPinned(pinned: boolean) {
        if (currentNote) {
          latestRef.current.handleSetNotePinned(currentNote.id, pinned);
        }
      },
      onSetReadonly(readonly: boolean) {
        if (currentNote) {
          latestRef.current.handleSetNoteReadonly(currentNote.id, readonly);
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
        latestRef.current.handleLoadConflictHead(snapshotId, markdown);
      },
      onSelectLinkedNote(noteId: string) {
        latestRef.current.handleSelectNote(noteId);
      },
      onResolveConflict() {
        setChooseConflictNoteId(currentNote?.id ?? null);
        setChooseConflictDialogOpen(true);
      },
      onOpenHistory() {
        latestRef.current.handleOpenNoteHistory();
      },
    }),
    [
      availableTagPaths,
      noteBacklinksQuery.data,
      currentEditorMarkdown,
      currentNoteConflict,
      currentNote,
      currentNoteId,
      displayedSelectedNoteId,
      isDeletePublishedNotePending,
      isCreatingNote,
      isPublishNotePending,
      isPublishShortNotePending,
      isResolveConflictPending,
      pendingAutoFocusEditorNoteId,
      searchQuery,
      selectedConflictSnapshotId,
      setChooseConflictNoteId,
      setChooseConflictDialogOpen,
      setDeletePublishDialogOpen,
      setDraft,
      setPendingAutoFocusEditorNoteId,
      setPublishDialogOpen,
      setPublishShortNoteDialogOpen,
      syncEditorRevision,
    ],
  );

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

  const publishDialogProps = useMemo(
    () => ({
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
    }),
    [
      currentEditorMarkdown,
      currentNote?.id,
      currentNote?.tags,
      currentNote?.title,
      isPublishNotePending,
      mutatePublishNote,
      publishDialogOpen,
      setPublishDialogOpen,
    ],
  );

  const publishShortNoteDialogProps = useMemo(
    () => ({
      content: currentEditorMarkdown.replace(/^#\s+.*\n*/, "").trim(),
      initialTags: currentNote?.tags ?? [],
      noteId: currentNote?.id ?? "",
      open: publishShortNoteDialogOpen,
      pending: isPublishShortNotePending,
      onOpenChange: setPublishShortNoteDialogOpen,
      onSubmit(input: PublishShortNoteInput) {
        mutatePublishShortNote(input);
      },
    }),
    [
      currentEditorMarkdown,
      currentNote?.id,
      currentNote?.tags,
      isPublishShortNotePending,
      mutatePublishShortNote,
      publishShortNoteDialogOpen,
      setPublishShortNoteDialogOpen,
    ],
  );

  const deletePublishDialogProps = useMemo(
    () => ({
      open: deletePublishDialogOpen,
      pending: isDeletePublishedNotePending,
      onOpenChange: setDeletePublishDialogOpen,
      onConfirm() {
        if (currentNoteId) {
          mutateDeletePublishedNote(currentNoteId);
        }
      },
    }),
    [
      currentNoteId,
      deletePublishDialogOpen,
      isDeletePublishedNotePending,
      mutateDeletePublishedNote,
      setDeletePublishDialogOpen,
    ],
  );

  const chooseConflictDialogProps = useMemo(
    () => ({
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
        void latestRef.current
          .handleResolveCurrentNoteConflict("keep_deleted")
          .catch(() => {});
      },
      onRestore() {
        void latestRef.current
          .handleResolveCurrentNoteConflict("restore")
          .catch(() => {});
      },
      onMerge() {
        void latestRef.current
          .handleResolveCurrentNoteConflict("merge")
          .catch(() => {});
      },
    }),
    [
      currentNoteConflict?.hasDeleteCandidate,
      chooseConflictDialogOpen,
      isResolveConflictPending,
      setChooseConflictNoteId,
      setChooseConflictDialogOpen,
    ],
  );

  const noteHistoryDialogProps = useMemo(
    () => ({
      noteId: currentNoteId,
      open: noteHistoryDialogOpen,
      pending: isRestoreHistoryPending,
      selectedSnapshotId: selectedHistorySnapshotId,
      snapshots: currentNoteHistory?.snapshots ?? [],
      hasConflict: isCurrentNoteConflicted,
      onOpenChange(open: boolean) {
        setNoteHistoryDialogOpen(open);
        if (!open) {
          setSelectedHistorySnapshotId(null);
        }
      },
      onRestore() {
        void latestRef.current.handleRestoreSelectedNoteHistorySnapshot();
      },
      onSelectSnapshot(snapshotId: string) {
        latestRef.current.handleSelectNoteHistorySnapshot(snapshotId);
      },
    }),
    [
      currentNoteHistory?.snapshots,
      currentNoteId,
      isCurrentNoteConflicted,
      isRestoreHistoryPending,
      noteHistoryDialogOpen,
      selectedHistorySnapshotId,
      setNoteHistoryDialogOpen,
      setSelectedHistorySnapshotId,
    ],
  );

  const { isMutatingNote } = noteOps;

  const notesPaneProps = useMemo(
    () => ({
      activeTagPath: visibleActiveTagPath,
      creatingNoteId: creatingSelectedNoteId,
      filteredNotes: currentNotes,
      hasMoreNotes: notesQuery.hasNextPage,
      isCreatingNote,
      isLoadingMoreNotes: notesQuery.isFetchingNextPage,
      sortField: noteSortField,
      sortDirection: noteSortDirection,
      isNotesPlaceholderData: notesQuery.isPlaceholderData,
      onChangeSortField: (field: NoteSortField) =>
        setNoteSortPrefs(sortViewKey, { field }),
      onChangeSortDirection: (direction: NoteSortDirection) =>
        setNoteSortPrefs(sortViewKey, { direction }),
      isMutatingNote,
      noteFilter: effectiveNoteFilter,
      onArchiveNote: (noteId: string) =>
        latestRef.current.handleArchiveNote(noteId),
      onChangeSearch: setSearchQuery,
      onCopyNoteContent: (noteId: string) =>
        latestRef.current.handleCopyNoteContent(noteId),
      onCreateNote: () => latestRef.current.handleCreateNote(),
      onDeleteNotePermanently: (noteId: string) =>
        latestRef.current.handleDeleteNotePermanently(noteId),
      onDuplicateNote: (noteId: string) =>
        latestRef.current.handleDuplicateNote(noteId),
      onExportNotes: () => latestRef.current.handleExportNotes(),
      onLoadMore() {
        if (notesQuery.hasNextPage && !notesQuery.isFetchingNextPage) {
          void latestRef.current.fetchNextPage();
        }
      },
      onRestoreFromTrash: (noteId: string) =>
        latestRef.current.handleRestoreFromTrash(noteId),
      onRestoreNote: (noteId: string) =>
        latestRef.current.handleRestoreNote(noteId),
      onTrashNote: (noteId: string) =>
        latestRef.current.handleTrashNote(noteId),
      onSelectNote: (noteId: string) => {
        latestRef.current.handleSelectNote(noteId);
      },
      onSetNotePinned: (noteId: string, pinned: boolean) =>
        latestRef.current.handleSetNotePinned(noteId, pinned),
      onSetNoteReadonly: (noteId: string, readonly: boolean) =>
        latestRef.current.handleSetNoteReadonly(noteId, readonly),
      searchQuery,
      selectedNoteId: displayedSelectedNoteId,
      totalNoteCount,
    }),
    [
      visibleActiveTagPath,
      creatingSelectedNoteId,
      currentNotes,
      displayedSelectedNoteId,
      effectiveNoteFilter,
      isCreatingNote,
      isMutatingNote,
      noteSortDirection,
      noteSortField,
      notesQuery.hasNextPage,
      notesQuery.isFetchingNextPage,
      notesQuery.isPlaceholderData,
      searchQuery,
      setNoteSortPrefs,
      setSearchQuery,
      sortViewKey,
      totalNoteCount,
    ],
  );

  const sidebarPaneProps = useMemo(
    () => ({
      activeTagPath: visibleActiveTagPath,
      availableTagPaths,
      availableTagTree,
      archivedCount: bootstrapQuery.data?.archivedCount ?? 0,
      todoCount: todoCountQuery.data ?? 0,
      trashedCount: bootstrapQuery.data?.trashedCount ?? 0,
      noteFilter,
      onSelectAll: () => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectAll();
      },
      onSelectToday: () => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectToday();
      },
      onSelectTodo: () => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectTodo();
      },
      onSelectPinned: () => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectPinned();
      },
      onSelectUntagged: () => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectUntagged();
      },
      onSelectArchive: () => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectArchive();
      },
      onSelectTrash: () => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectTrash();
      },
      onDeleteTag: (path: string) => latestRef.current.handleDeleteTag(path),
      onEmptyTrash: () => latestRef.current.handleEmptyTrash(),
      onExportTag: (path: string) => latestRef.current.handleExportTag(path),
      onRenameTag: (fromPath: string, toPath: string) =>
        latestRef.current.handleRenameTag(fromPath, toPath),
      onSetTagHideSubtagNotes: (path: string, hideSubtagNotes: boolean) =>
        latestRef.current.handleSetHideSubtagNotes(path, hideSubtagNotes),
      onSetTagPinned: (path: string, pinned: boolean) =>
        latestRef.current.handleSetTagPinned(path, pinned),
      onSelectTagPath: (tagPath: string) => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectTagPath(tagPath);
      },
    }),
    [
      availableTagPaths,
      availableTagTree,
      bootstrapQuery.data?.archivedCount,
      bootstrapQuery.data?.trashedCount,
      noteFilter,
      setFocusedPane,
      todoCountQuery.data,
      visibleActiveTagPath,
    ],
  );

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
