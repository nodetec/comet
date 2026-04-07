import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastErrorHandler } from "@/shared/lib/mutation-utils";
import { errorMessage } from "@/shared/lib/utils";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import {
  defaultNoteSortPrefs,
  useUIStore,
} from "@/features/settings/store/use-ui-store";

import {
  deleteTag,
  exportNotes,
  loadNote,
  renameTag,
  resolveNoteConflict,
  setHideSubtagNotes,
  setTagPinned,
} from "@/shared/api/invoke";
import {
  type LoadedNote,
  type NoteSortDirection,
  type NoteSortField,
  type PublishNoteInput,
  type PublishShortNoteInput,
  type ResolveNoteConflictAction,
} from "@/shared/api/types";
import { usePublishState } from "@/features/publishing";

import { useNoteQueries } from "@/features/notes/hooks/use-note-queries";
import { useNoteMutations } from "@/features/notes/hooks/use-note-mutations";
import { canonicalizeTagPath } from "@/features/editor/lib/tags";
import { useSyncListener } from "@/features/shell/hooks/use-sync-listener";
import { useDraftPersistence } from "@/features/shell/hooks/use-draft-persistence";
import {
  FOCUS_TAG_PATH_EVENT,
  type FocusTagPathDetail,
} from "@/shared/lib/tag-navigation";
import {
  FOCUS_NOTE_EVENT,
  type FocusNoteDetail,
} from "@/shared/lib/note-navigation";

function matchesTagScope(tags: string[], tagPath: string) {
  return tags.some((tag) => tag === tagPath || tag.startsWith(`${tagPath}/`));
}

function haveSameWikilinkResolutions(
  left: LoadedNote["wikilinkResolutions"],
  right: LoadedNote["wikilinkResolutions"],
) {
  return (
    left.length === right.length &&
    left.every((resolution, index) => {
      const candidate = right[index];
      return (
        candidate?.occurrenceId === resolution.occurrenceId &&
        candidate?.location === resolution.location &&
        candidate?.targetNoteId === resolution.targetNoteId &&
        candidate?.title === resolution.title
      );
    })
  );
}

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
  const [noteHistoryDialogOpen, setNoteHistoryDialogOpen] = useState(false);
  const [selectedHistorySnapshotId, setSelectedHistorySnapshotId] = useState<
    string | null
  >(null);
  const [isRestoreHistoryPending, setIsRestoreHistoryPending] = useState(false);
  const [isTagMutationPending, setIsTagMutationPending] = useState(false);

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
  const previousConflictNoteIdRef = useRef<string | null>(null);
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

    if (noteQuery.data && noteQuery.data.id !== draftNoteId) {
      setDraft(noteQuery.data.id, noteQuery.data.markdown, {
        wikilinkResolutions: noteQuery.data.wikilinkResolutions,
      });
    }
  }, [draftNoteId, noteQuery.data, selectedNoteId, setDraft]);

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

  useEffect(() => {
    if (!noteHistoryDialogOpen) {
      setSelectedHistorySnapshotId(null);
      return;
    }

    if (!currentNoteId) {
      setNoteHistoryDialogOpen(false);
      setSelectedHistorySnapshotId(null);
      return;
    }

    if (!currentNoteHistory || currentNoteHistory.snapshotCount === 0) {
      setSelectedHistorySnapshotId(null);
      return;
    }

    if (
      selectedHistorySnapshotId &&
      currentNoteHistory.snapshots.some(
        (snapshot) => snapshot.snapshotId === selectedHistorySnapshotId,
      )
    ) {
      return;
    }

    setSelectedHistorySnapshotId(
      currentNoteHistory.snapshots.find((snapshot) => snapshot.isCurrent)
        ?.snapshotId ??
        currentNoteHistory.snapshots[0]?.snapshotId ??
        null,
    );
  }, [
    currentNoteHistory,
    currentNoteId,
    noteHistoryDialogOpen,
    selectedHistorySnapshotId,
  ]);

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

  // --- Flush / discard helpers ---
  const flushCurrentDraft = () => {
    if (!currentNote || draftNoteId !== currentNote.id) {
      return;
    }

    if (isCurrentNoteConflicted) {
      return;
    }

    if (
      draftMarkdown === currentNote.markdown &&
      !hasPendingWikilinkResolutionChanges
    ) {
      return;
    }

    if (pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }

    saveNoteMutation.mutate({
      id: currentNote.id,
      markdown: draftMarkdown,
      wikilinkResolutions: draftWikilinkResolutions,
    });
  };

  const flushCurrentDraftAsync = async (): Promise<LoadedNote | undefined> => {
    if (!currentNote || draftNoteId !== currentNote.id) {
      return undefined;
    }

    if (isCurrentNoteConflicted) {
      return undefined;
    }

    if (
      draftMarkdown === currentNote.markdown &&
      !hasPendingWikilinkResolutionChanges
    ) {
      return undefined;
    }

    if (pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }

    return await saveNoteMutation.mutateAsync({
      id: currentNote.id,
      markdown: draftMarkdown,
      wikilinkResolutions: draftWikilinkResolutions,
    });
  };

  const withFlushedCurrentDraft = (
    action: (savedNote?: LoadedNote) => void | Promise<void>,
  ) => {
    void (async () => {
      try {
        const savedNote = await flushCurrentDraftAsync();
        await action(savedNote);
      } catch {
        // Save failures already surface through the mutation error handler.
      }
    })();
  };

  const discardPendingSave = () => {
    if (pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }
  };

  // --- Account change listener ---
  useEffect(() => {
    const handlePrepareAccountChange = () => {
      void (async () => {
        try {
          await latestRef.current.flushCurrentDraftAsync();
          window.dispatchEvent(
            new CustomEvent("comet:account-change-prepared", {
              detail: { ok: true },
            }),
          );
        } catch (error) {
          window.dispatchEvent(
            new CustomEvent("comet:account-change-prepared", {
              detail: {
                ok: false,
                message: errorMessage(
                  error,
                  "Couldn't save the current draft.",
                ),
              },
            }),
          );
        }
      })();
    };

    window.addEventListener(
      "comet:prepare-account-change",
      handlePrepareAccountChange,
    );
    return () => {
      window.removeEventListener(
        "comet:prepare-account-change",
        handlePrepareAccountChange,
      );
    };
  }, []);

  useEffect(() => {
    const handleFocusTagPath = (event: Event) => {
      const customEvent = event as CustomEvent<FocusTagPathDetail>;
      const tagPath = canonicalizeTagPath(customEvent.detail?.tagPath ?? "");
      if (!tagPath) {
        return;
      }

      setFocusedPane("notes");
      latestRef.current.handleSelectTagPath(tagPath);
    };

    window.addEventListener(FOCUS_TAG_PATH_EVENT, handleFocusTagPath);
    return () => {
      window.removeEventListener(FOCUS_TAG_PATH_EVENT, handleFocusTagPath);
    };
  }, [setFocusedPane]);

  useEffect(() => {
    const handleFocusNote = (event: Event) => {
      const customEvent = event as CustomEvent<FocusNoteDetail>;
      const noteId = customEvent.detail?.noteId?.trim();
      if (!noteId) {
        return;
      }

      setFocusedPane("editor");
      latestRef.current.handleSelectNote(noteId);
    };

    window.addEventListener(FOCUS_NOTE_EVENT, handleFocusNote);
    return () => {
      window.removeEventListener(FOCUS_NOTE_EVENT, handleFocusNote);
    };
  }, [setFocusedPane]);

  // --- Handlers ---
  const handleCreateNote = () => {
    if (isCreatingNote) {
      return;
    }

    flushCurrentDraft();
    const tagsForNewNote =
      tagViewActive && activeTagPath ? [activeTagPath] : [];
    if (
      !tagViewActive &&
      noteFilter !== "today" &&
      noteFilter !== "todo" &&
      noteFilter !== "pinned" &&
      noteFilter !== "untagged"
    ) {
      setNoteFilter("all");
    }
    setSearchQuery("");
    setCreatingSelectedNoteId(null);
    setIsCreatingNoteTransition(true);
    createNoteMutation.mutate({
      tags: tagsForNewNote,
      markdown: effectiveNoteFilter === "todo" ? "- [ ] " : "# ",
    });
  };

  const clearSelectionIfNotActive = () => {
    if (currentNote && (currentNote.archivedAt || currentNote.deletedAt)) {
      setSelectedNoteId(null);
      setDraft("", "");
    }
  };

  const handleSelectAll = () => {
    withFlushedCurrentDraft(() => {
      clearSelectionIfNotActive();
      setTagViewActive(false);
      setNoteFilter("all");
    });
  };

  const handleSelectToday = () => {
    withFlushedCurrentDraft(() => {
      clearSelectionIfNotActive();
      setTagViewActive(false);
      setNoteFilter("today");
    });
  };

  const handleSelectTodo = () => {
    withFlushedCurrentDraft(() => {
      clearSelectionIfNotActive();
      setTagViewActive(false);
      setNoteFilter("todo");
    });
  };

  const handleSelectPinned = () => {
    withFlushedCurrentDraft(() => {
      clearSelectionIfNotActive();
      setTagViewActive(false);
      setNoteFilter("pinned");
    });
  };

  const handleSelectUntagged = () => {
    withFlushedCurrentDraft(() => {
      clearSelectionIfNotActive();
      setTagViewActive(false);
      setNoteFilter("untagged");
    });
  };

  const handleSelectArchive = () => {
    withFlushedCurrentDraft(() => {
      setSelectedNoteId(null);
      setDraft("", "");
      setTagViewActive(false);
      setNoteFilter("archive");
    });
  };

  const handleSelectTrash = () => {
    withFlushedCurrentDraft(() => {
      setSelectedNoteId(null);
      setDraft("", "");
      setTagViewActive(false);
      setNoteFilter("trash");
    });
  };

  const handleEmptyTrash = () => {
    emptyTrashMutation.mutate();
  };

  const handleSelectTagPath = (tagPath: string) => {
    if (tagViewActive && activeTagPath === tagPath) {
      return;
    }

    withFlushedCurrentDraft((savedNote) => {
      const noteForScope = savedNote ?? currentNote;

      if (noteForScope && !matchesTagScope(noteForScope.tags, tagPath)) {
        setSelectedNoteId(null);
        setDraft("", "");
      }

      setTagViewActive(true);
      setActiveTagPath(tagPath);
    });
  };

  const syncSelectedNoteAfterTagRewrite = async (affectedNoteIds: string[]) => {
    if (!selectedNoteId || !affectedNoteIds.includes(selectedNoteId)) {
      await queryClient.invalidateQueries({ queryKey: ["note"] });
      return;
    }

    const refreshedNote = await loadNote(selectedNoteId);
    queryClient.setQueryData(["note", refreshedNote.id], refreshedNote);
    setDraft(refreshedNote.id, refreshedNote.markdown, {
      wikilinkResolutions: refreshedNote.wikilinkResolutions,
    });
    bumpSyncEditorRevision("tag-rewrite-refresh", {
      noteId: refreshedNote.id,
      refreshedLength: refreshedNote.markdown.length,
    });
  };

  const handleRenameTag = (fromPath: string, toPath: string) => {
    if (isTagMutationPending) {
      return;
    }

    void (async () => {
      setIsTagMutationPending(true);

      try {
        if (
          currentNote &&
          isCurrentNoteConflicted &&
          currentNote.tags.includes(fromPath)
        ) {
          toast.error(
            "Resolve the current note conflict before renaming this tag.",
            {
              id: "rename-tag-conflict-error",
            },
          );
          return;
        }

        if (
          currentNote &&
          draftNoteId === currentNote.id &&
          currentNote.tags.includes(fromPath)
        ) {
          await flushCurrentDraftAsync();
        }

        const affectedNoteIds = await renameTag({ fromPath, toPath });
        const nextPath = canonicalizeTagPath(toPath) ?? toPath;
        setActiveTagPath(activeTagPath === fromPath ? nextPath : activeTagPath);

        await Promise.all([
          invalidateNotes(),
          invalidateContextualTags(),
          syncSelectedNoteAfterTagRewrite(affectedNoteIds),
        ]);

        toast.success("Tag renamed.", { id: "rename-tag-success" });
      } catch (error) {
        toastErrorHandler("Couldn't rename tag", "rename-tag-error")(error);
      } finally {
        setIsTagMutationPending(false);
      }
    })();
  };

  const handleDeleteTag = (path: string) => {
    if (isTagMutationPending) {
      return;
    }

    void (async () => {
      setIsTagMutationPending(true);

      try {
        if (
          currentNote &&
          isCurrentNoteConflicted &&
          currentNote.tags.includes(path)
        ) {
          toast.error(
            "Resolve the current note conflict before deleting this tag.",
            {
              id: "delete-tag-conflict-error",
            },
          );
          return;
        }

        if (
          currentNote &&
          draftNoteId === currentNote.id &&
          currentNote.tags.includes(path)
        ) {
          await flushCurrentDraftAsync();
        }

        const affectedNoteIds = await deleteTag({ path });
        if (activeTagPath === path) {
          setActiveTagPath(null);
          setTagViewActive(false);
        }

        await Promise.all([
          invalidateNotes(),
          invalidateContextualTags(),
          syncSelectedNoteAfterTagRewrite(affectedNoteIds),
        ]);

        toast.success("Tag deleted.", { id: "delete-tag-success" });
      } catch (error) {
        toastErrorHandler("Couldn't delete tag", "delete-tag-error")(error);
      } finally {
        setIsTagMutationPending(false);
      }
    })();
  };

  const handleSetTagPinned = (path: string, pinned: boolean) => {
    if (isTagMutationPending) {
      return;
    }

    void (async () => {
      setIsTagMutationPending(true);
      try {
        await setTagPinned({ path, pinned });
        await invalidateContextualTags();
      } catch (error) {
        toastErrorHandler(
          "Couldn't update tag pin",
          "set-tag-pinned-error",
        )(error);
      } finally {
        setIsTagMutationPending(false);
      }
    })();
  };

  const handleSetHideSubtagNotes = (path: string, hideSubtagNotes: boolean) => {
    if (isTagMutationPending) {
      return;
    }

    void (async () => {
      setIsTagMutationPending(true);
      try {
        await setHideSubtagNotes({ path, hideSubtagNotes });
        await Promise.all([invalidateNotes(), invalidateContextualTags()]);
      } catch (error) {
        toastErrorHandler(
          "Couldn't update tag visibility",
          "set-hide-subtag-notes-error",
        )(error);
      } finally {
        setIsTagMutationPending(false);
      }
    })();
  };

  const handleSelectNote = (noteId: string) => {
    if (noteId === selectedNoteId) {
      return;
    }

    flushCurrentDraft();
    setCreatingSelectedNoteId(null);
    setPendingAutoFocusEditorNoteId(null);
    setSelectedNoteId(noteId);
  };

  const handleArchiveNote = (noteId: string) => {
    void (async () => {
      if (
        archiveNoteMutation.isPending ||
        restoreNoteMutation.isPending ||
        deleteNotePermanentlyMutation.isPending
      ) {
        return;
      }

      if (noteId === selectedNoteId) {
        await flushCurrentDraftAsync();
      }

      await archiveNoteMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleRestoreNote = (noteId: string) => {
    void (async () => {
      if (
        archiveNoteMutation.isPending ||
        restoreNoteMutation.isPending ||
        deleteNotePermanentlyMutation.isPending
      ) {
        return;
      }

      await restoreNoteMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleTrashNote = (noteId: string) => {
    void (async () => {
      if (
        trashNoteMutation.isPending ||
        deleteNotePermanentlyMutation.isPending
      ) {
        return;
      }

      if (noteId === selectedNoteId) {
        discardPendingSave();
      }

      await trashNoteMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleRestoreFromTrash = (noteId: string) => {
    void (async () => {
      if (
        restoreFromTrashMutation.isPending ||
        deleteNotePermanentlyMutation.isPending
      ) {
        return;
      }

      await restoreFromTrashMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleDeleteNotePermanently = (noteId: string) => {
    void (async () => {
      if (
        trashNoteMutation.isPending ||
        restoreFromTrashMutation.isPending ||
        deleteNotePermanentlyMutation.isPending
      ) {
        return;
      }

      if (noteId === selectedNoteId) {
        discardPendingSave();
      }

      await deleteNotePermanentlyMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleSetNotePinned = (noteId: string, pinned: boolean) => {
    if (
      archiveNoteMutation.isPending ||
      restoreNoteMutation.isPending ||
      deleteNotePermanentlyMutation.isPending ||
      pinNoteMutation.isPending ||
      unpinNoteMutation.isPending ||
      duplicateNoteMutation.isPending ||
      setNoteReadonlyMutation.isPending
    ) {
      return;
    }

    const mutation = pinned ? pinNoteMutation : unpinNoteMutation;
    void mutation.mutateAsync(noteId).catch(() => {});
  };

  const handleSetNoteReadonly = (noteId: string, readonly: boolean) => {
    if (
      archiveNoteMutation.isPending ||
      restoreNoteMutation.isPending ||
      deleteNotePermanentlyMutation.isPending ||
      pinNoteMutation.isPending ||
      unpinNoteMutation.isPending ||
      duplicateNoteMutation.isPending ||
      setNoteReadonlyMutation.isPending
    ) {
      return;
    }

    void (async () => {
      if (noteId === selectedNoteId) {
        await flushCurrentDraftAsync();
      }

      await setNoteReadonlyMutation.mutateAsync({
        noteId,
        readonly,
      });
    })().catch(() => {});
  };

  const handleDuplicateNote = (noteId: string) => {
    if (
      archiveNoteMutation.isPending ||
      restoreNoteMutation.isPending ||
      deleteNotePermanentlyMutation.isPending ||
      pinNoteMutation.isPending ||
      unpinNoteMutation.isPending ||
      duplicateNoteMutation.isPending ||
      setNoteReadonlyMutation.isPending
    ) {
      return;
    }

    void (async () => {
      if (noteId === selectedNoteId) {
        await flushCurrentDraftAsync();
      }

      await duplicateNoteMutation.mutateAsync(noteId);
    })().catch(() => {});
  };

  const handleCopyNoteContent = (noteId: string) => {
    void (async () => {
      try {
        if (noteId === selectedNoteId && draftNoteId === noteId) {
          await writeText(draftMarkdown);
          return;
        }

        const note =
          queryClient.getQueryData<LoadedNote>(["note", noteId]) ??
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
                exportDir: selected as string,
              }
            : {
                exportMode: "note_filter",
                noteFilter,
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
          currentNote &&
          draftNoteId === currentNote.id &&
          matchesTagScope(currentNote.tags, tagPath)
        ) {
          await flushCurrentDraftAsync();
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

  // Keep latest handler references for stable memoized callbacks
  const currentHandlers = {
    fetchNextPage: notesQuery.fetchNextPage,
    flushCurrentDraftAsync,
    handleArchiveNote,
    handleCopyNoteContent,
    handleCreateNote,
    handleDuplicateNote,
    handleDeleteNotePermanently,
    handleEmptyTrash,
    handleExportNotes,
    handleExportTag,
    handleRestoreFromTrash,
    handleRestoreNote,
    handleDeleteTag,
    handleSelectAll,
    handleSelectArchive,
    handleSelectTrash,
    handleTrashNote,
    handleRenameTag,
    handleSelectNote,
    handleSetHideSubtagNotes,
    handleSetTagPinned,
    handleSelectToday,
    handleSelectTodo,
    handleSelectPinned,
    handleSelectUntagged,
    handleSetNotePinned,
    handleSetNoteReadonly,
    handleSelectTagPath,
    handleOpenNoteHistory() {
      if (!currentNoteId) {
        return;
      }
      setNoteHistoryDialogOpen(true);
    },
    handleSelectNoteHistorySnapshot(snapshotId: string) {
      setSelectedHistorySnapshotId(snapshotId);
    },
    async handleRestoreSelectedNoteHistorySnapshot() {
      if (!currentNoteId || !currentNoteHistory || !selectedHistorySnapshotId) {
        return;
      }

      if (isCurrentNoteConflicted) {
        toast.error(
          "Resolve the current note conflict before restoring history.",
          {
            id: "restore-history-conflict-error",
          },
        );
        return;
      }

      const snapshot = currentNoteHistory.snapshots.find(
        (entry) => entry.snapshotId === selectedHistorySnapshotId,
      );
      if (!snapshot || snapshot.op === "del" || !snapshot.markdown) {
        return;
      }

      setIsRestoreHistoryPending(true);
      try {
        discardPendingSave();
        const savedNote = await saveNoteMutation.mutateAsync({
          id: currentNoteId,
          markdown: snapshot.markdown,
          wikilinkResolutions: snapshot.wikilinkResolutions,
        });
        setDraft(currentNoteId, snapshot.markdown, {
          wikilinkResolutions: savedNote.wikilinkResolutions,
        });
        setNoteHistoryDialogOpen(false);
        toast.success("Snapshot restored.", {
          id: "restore-history-success",
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["note", currentNoteId] }),
          queryClient.invalidateQueries({
            queryKey: ["note-history", currentNoteId],
          }),
          queryClient.invalidateQueries({ queryKey: ["notes"] }),
          queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        ]);
      } catch (error) {
        toastErrorHandler(
          "Couldn't restore snapshot",
          "restore-history-error",
        )(error);
      } finally {
        setIsRestoreHistoryPending(false);
      }
    },
    async handleResolveCurrentNoteConflict(action: ResolveNoteConflictAction) {
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
          queryClient.invalidateQueries({ queryKey: ["note", resolvedNoteId] }),
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
    },
    handleLoadConflictHead(snapshotId: string, markdown: string | null) {
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
    },
  };
  const latestRef = useRef(currentHandlers);
  latestRef.current = currentHandlers;

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
    ],
  );

  const isMutatingNote =
    archiveNoteMutation.isPending ||
    restoreNoteMutation.isPending ||
    deleteNotePermanentlyMutation.isPending ||
    pinNoteMutation.isPending ||
    unpinNoteMutation.isPending ||
    duplicateNoteMutation.isPending ||
    setNoteReadonlyMutation.isPending;

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
        setFocusedPane("notes");
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
      searchQuery,
      setFocusedPane,
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
