import { useEffect, useMemo, useRef, useState } from "react";
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
  exportNotes,
  loadNote,
  resolveNoteConflict,
} from "@/shared/api/invoke";
import {
  type LoadedNote,
  type NoteSortDirection,
  type NoteSortField,
  type PublishNoteInput,
  type PublishShortNoteInput,
} from "@/shared/api/types";
import { useNotebookState } from "./use-notebook-state";
import { usePublishState } from "@/features/publishing";

import { useNoteQueries } from "@/features/notes/hooks/use-note-queries";
import { useNoteMutations } from "@/features/notes/hooks/use-note-mutations";
import { useSyncListener } from "@/features/shell/hooks/use-sync-listener";
import { useDraftPersistence } from "@/features/shell/hooks/use-draft-persistence";

export function useShellController() {
  const [hasHydratedInitialSelection, setHasHydratedInitialSelection] =
    useState(false);
  const [isCreatingNoteTransition, setIsCreatingNoteTransition] =
    useState(false);
  const [creatingSelectedNoteId, setCreatingSelectedNoteId] = useState<
    string | null
  >(null);
  const [syncEditorRevision, setSyncEditorRevision] = useState(0);
  const [editorFocusMode, setEditorFocusMode] = useState<
    "none" | "immediate" | "pointerup"
  >("none");

  const notebook = useNotebookState();
  const publish = usePublishState();
  const {
    deleteNotebookMutation,
    editingNotebookId,
    handleDeleteNotebook,
    hideCreateNotebook,
    hideRenameNotebook,
    isCreatingNotebook,
    newNotebookName,
    renameNotebookMutation,
    renamingNotebookName,
    setNewNotebookName,
    setRenamingNotebookName,
    showCreateNotebook,
    showRenameNotebook,
    submitNotebook,
    submitRenameNotebook,
  } = notebook;
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
  const activeNotebookId = useShellStore((state) => state.activeNotebookId);
  const activeTags = useShellStore((state) => state.activeTags);
  const draftMarkdown = useShellStore((state) => state.draftMarkdown);
  const draftNoteId = useShellStore((state) => state.draftNoteId);
  const noteFilter = useShellStore((state) => state.noteFilter);
  const searchQuery = useShellStore((state) => state.searchQuery);
  const selectedNoteId = useShellStore((state) => state.selectedNoteId);
  const clearActiveTags = useShellStore((state) => state.clearActiveTags);
  const setDraft = useShellStore((state) => state.setDraft);
  const setActiveTags = useShellStore((state) => state.setActiveTags);
  const setNoteFilter = useShellStore((state) => state.setNoteFilter);
  const setNotebookFilter = useShellStore((state) => state.setNotebookFilter);
  const setSearchQuery = useShellStore((state) => state.setSearchQuery);
  const setSelectedNoteId = useShellStore((state) => state.setSelectedNoteId);
  const setFocusedPane = useShellStore((state) => state.setFocusedPane);

  const sortViewKey =
    noteFilter === "notebook" ? (activeNotebookId ?? "all") : noteFilter;
  const sortPrefs =
    useUIStore((state) => state.noteSortPrefs[sortViewKey]) ??
    defaultNoteSortPrefs;
  const setNoteSortPrefs = useUIStore((state) => state.setNoteSortPrefs);
  const previousConflictNoteIdRef = useRef<string | null>(null);
  const noteSortField = sortPrefs.field;
  const noteSortDirection = sortPrefs.direction;

  // --- Queries ---
  const {
    bootstrapQuery,
    todoCountQuery,
    notesQuery,
    noteQuery,
    noteConflictQuery,
    currentNotes,
    notebooks,
    activeNotebook,
    availableTags,
    totalNoteCount,
    activeNpub,
    initialSelectedNoteId,
  } = useNoteQueries({
    noteFilter,
    activeNotebookId,
    activeTags,
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
    assignNoteNotebookMutation,
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
    noteFilter,
    activeNotebookId,
    activeNpub,
    isSavingRef,
    setSelectedNoteId,
    setDraft,
    setCreatingSelectedNoteId,
    setIsCreatingNoteTransition,
    setEditorFocusMode,
    setNoteFilter,
  });

  const { isPending: saveNotePending, mutate: mutateSaveNote } =
    saveNoteMutation;

  // --- Sync listener ---
  useSyncListener({
    queryClient,
    pendingSaveTimeoutRef,
    isSavingRef,
    setSyncEditorRevision,
  });

  // --- Active tags cleanup when available tags change ---
  useEffect(() => {
    if (activeTags.length === 0) {
      return;
    }

    const nextActiveTags = activeTags.filter((tag) =>
      availableTags.includes(tag),
    );
    if (nextActiveTags.length !== activeTags.length) {
      setActiveTags(nextActiveTags);
    }
  }, [activeTags, availableTags, setActiveTags]);

  // --- Notebook filter cleanup ---
  useEffect(() => {
    if (noteFilter !== "notebook") {
      return;
    }

    if (!activeNotebookId || !activeNotebook) {
      clearActiveTags();
      setNoteFilter("all");
    }
  }, [
    activeNotebook,
    activeNotebookId,
    clearActiveTags,
    noteFilter,
    setNoteFilter,
  ]);

  // --- Sync draft from loaded note ---
  useEffect(() => {
    if (noteQuery.data && noteQuery.data.id !== draftNoteId) {
      setDraft(noteQuery.data.id, noteQuery.data.markdown);
    }
  }, [draftNoteId, noteQuery.data, setDraft]);

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

  const currentNote = noteQuery.data;
  const currentNoteConflict = noteConflictQuery.data;
  const isCurrentNoteConflicted = (currentNoteConflict?.headCount ?? 0) > 1;
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
    isCurrentNoteConflicted,
    saveNotePending,
    mutateSaveNote,
    pendingSaveTimeoutRef,
    queryClient,
  });

  useEffect(() => {
    if (!currentNote) {
      previousConflictNoteIdRef.current = null;
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
      draftMarkdown !== currentNote.markdown
    ) {
      setDraft(currentNote.id, currentNote.markdown);
      setSyncEditorRevision((revision) => revision + 1);
    }
  }, [
    currentNote,
    draftMarkdown,
    draftNoteId,
    isCurrentNoteConflicted,
    pendingSaveTimeoutRef,
    setDraft,
  ]);

  // --- Flush / discard helpers ---
  const flushCurrentDraft = () => {
    if (!currentNote || draftNoteId !== currentNote.id) {
      return;
    }

    if (isCurrentNoteConflicted) {
      return;
    }

    if (draftMarkdown === currentNote.markdown) {
      return;
    }

    if (pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }

    saveNoteMutation.mutate({
      id: currentNote.id,
      markdown: draftMarkdown,
    });
  };

  const flushCurrentDraftAsync = async () => {
    if (!currentNote || draftNoteId !== currentNote.id) {
      return;
    }

    if (isCurrentNoteConflicted) {
      return;
    }

    if (draftMarkdown === currentNote.markdown) {
      return;
    }

    if (pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }

    await saveNoteMutation.mutateAsync({
      id: currentNote.id,
      markdown: draftMarkdown,
    });
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

  // --- Handlers ---
  const handleCreateNote = (source: "keyboard" | "pointer") => {
    if (isCreatingNote) {
      return;
    }

    flushCurrentDraft();
    const tagsForNewNote = [...activeTags];
    if (
      noteFilter !== "notebook" &&
      noteFilter !== "today" &&
      noteFilter !== "todo"
    ) {
      setNoteFilter("all");
    }
    setSearchQuery("");
    setCreatingSelectedNoteId(null);
    setIsCreatingNoteTransition(true);
    setEditorFocusMode(source === "pointer" ? "pointerup" : "immediate");
    createNoteMutation.mutate({
      notebookId: noteFilter === "notebook" ? activeNotebookId : null,
      tags: tagsForNewNote,
      markdown: noteFilter === "todo" ? "- [ ] " : undefined,
    });
  };

  const clearSelectionIfNotActive = () => {
    if (currentNote && (currentNote.archivedAt || currentNote.deletedAt)) {
      setSelectedNoteId(null);
      setDraft("", "");
    }
  };

  const handleSelectAll = () => {
    clearSelectionIfNotActive();
    setNoteFilter("all");
  };

  const handleSelectToday = () => {
    clearSelectionIfNotActive();
    setNoteFilter("today");
  };

  const handleSelectTodo = () => {
    clearSelectionIfNotActive();
    setNoteFilter("todo");
  };

  const handleSelectArchive = () => {
    setSelectedNoteId(null);
    setDraft("", "");
    setNoteFilter("archive");
  };

  const handleSelectTrash = () => {
    setSelectedNoteId(null);
    setDraft("", "");
    setNoteFilter("trash");
  };

  const handleEmptyTrash = () => {
    emptyTrashMutation.mutate();
  };

  const handleSelectNotebook = (notebookId: string) => {
    if (
      currentNote &&
      (currentNote.notebook?.id !== notebookId ||
        currentNote.archivedAt ||
        currentNote.deletedAt)
    ) {
      setSelectedNoteId(null);
      setDraft("", "");
    }
    setNotebookFilter(notebookId);
  };

  const handleToggleTag = (tag: string) => {
    if (activeTags.includes(tag)) {
      setActiveTags(activeTags.filter((activeTag) => activeTag !== tag));
      return;
    }

    setActiveTags([...activeTags, tag]);
  };

  const handleSelectNote = (noteId: string) => {
    if (noteId === selectedNoteId) {
      return;
    }

    flushCurrentDraft();
    setCreatingSelectedNoteId(null);
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

  const handleAssignNoteNotebook = (
    noteId: string,
    notebookId: string | null,
  ) => {
    if (
      archiveNoteMutation.isPending ||
      restoreNoteMutation.isPending ||
      deleteNotePermanentlyMutation.isPending ||
      assignNoteNotebookMutation.isPending ||
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

      await assignNoteNotebookMutation.mutateAsync({
        noteId,
        notebookId,
      });
    })().catch(() => {});
  };

  const handleSetNotePinned = (noteId: string, pinned: boolean) => {
    if (
      archiveNoteMutation.isPending ||
      restoreNoteMutation.isPending ||
      deleteNotePermanentlyMutation.isPending ||
      assignNoteNotebookMutation.isPending ||
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
      assignNoteNotebookMutation.isPending ||
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
      assignNoteNotebookMutation.isPending ||
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
        const selected = await open({ directory: true, title: "Export notes" });
        if (!selected) return;

        const count = await exportNotes({
          noteFilter: noteFilter,
          activeNotebookId: noteFilter === "notebook" ? activeNotebookId : null,
          exportDir: selected as string,
        });

        toast.success(`Exported ${count} note${count === 1 ? "" : "s"}`, {
          id: "export-notes-success",
        });
      } catch (error) {
        toastErrorHandler("Couldn't export notes", "export-notes-error")(error);
      }
    })();
  };

  // Keep latest handler references for stable memoized callbacks
  const currentHandlers = {
    fetchNextPage: notesQuery.fetchNextPage,
    flushCurrentDraftAsync,
    handleAssignNoteNotebook,
    handleArchiveNote,
    handleCopyNoteContent,
    handleCreateNote,
    handleDeleteNotebook,
    handleDuplicateNote,
    handleDeleteNotePermanently,
    handleEmptyTrash,
    handleExportNotes,
    handleRestoreFromTrash,
    handleRestoreNote,
    handleSelectAll,
    handleSelectArchive,
    handleSelectTrash,
    handleTrashNote,
    handleSelectNote,
    handleSelectNotebook,
    handleSelectToday,
    handleSelectTodo,
    handleSetNotePinned,
    handleSetNoteReadonly,
    handleToggleTag,
    async handleResolveCurrentNoteConflict() {
      if (!currentNote) {
        return;
      }

      if (
        draftNoteId === currentNote.id &&
        draftMarkdown !== currentNote.markdown
      ) {
        await saveNoteMutation.mutateAsync({
          id: currentNote.id,
          markdown: draftMarkdown,
        });
        return;
      }

      try {
        await resolveNoteConflict(currentNote.id);
        toast.success("Conflict resolution published.", {
          id: "resolve-note-conflict-success",
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["note", currentNote.id] }),
          queryClient.invalidateQueries({
            queryKey: ["note-conflict", currentNote.id],
          }),
          queryClient.invalidateQueries({ queryKey: ["notes"] }),
          queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        ]);
      } catch (error) {
        toastErrorHandler(
          "Couldn't resolve note conflict",
          "resolve-note-conflict-error",
        )(error);
      }
    },
    handleLoadConflictHead(markdown: string) {
      if (!currentNote) {
        return;
      }
      setDraft(currentNote.id, markdown);
      setSyncEditorRevision((revision) => revision + 1);
    },
    submitNotebook,
    submitRenameNotebook,
  };
  const latestRef = useRef(currentHandlers);
  latestRef.current = currentHandlers;

  // --- Props assembly ---
  const nextEditorPaneProps = useMemo(
    () => ({
      archivedAt: currentNote?.archivedAt ?? null,
      deletedAt: currentNote?.deletedAt ?? null,
      focusMode:
        currentNote && currentNote.id === selectedNoteId
          ? editorFocusMode
          : ("none" as const),
      html:
        currentNote && currentEditorMarkdown === currentNote.markdown
          ? (currentNote.html ?? null)
          : null,
      isNewNote:
        currentNote != null && currentNote.id === creatingSelectedNoteId,
      markdown: currentEditorMarkdown,
      modifiedAt: currentNote?.modifiedAt ?? 0,
      noteConflict: currentNoteConflict ?? null,
      notebook: currentNote?.notebook ?? null,
      notebooks,
      noteId:
        displayedSelectedNoteId || isCreatingNote
          ? (currentNote?.id ?? null)
          : null,
      editorKey: currentNote ? `${currentNote.id}-${syncEditorRevision}` : null,
      pinnedAt: currentNote?.pinnedAt ?? null,
      publishedAt: currentNote?.publishedAt ?? null,
      publishedKind: currentNote?.publishedKind ?? null,
      readonly: currentNote?.readonly ?? false,
      searchQuery,
      isDeletePublishedNotePending,
      isResolveConflictPending: false,
      onAssignNotebook(notebookId: string | null) {
        if (currentNote) {
          latestRef.current.handleAssignNoteNotebook(
            currentNote.id,
            notebookId,
          );
        }
      },
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
          setDraft(currentNote.id, markdown);
        }
      },
      onFocusHandled() {
        setEditorFocusMode("none");
      },
      onLoadConflictHead(markdown: string) {
        latestRef.current.handleLoadConflictHead(markdown);
      },
      onResolveConflict() {
        void latestRef.current
          .handleResolveCurrentNoteConflict()
          .catch(() => {});
      },
    }),
    [
      creatingSelectedNoteId,
      currentEditorMarkdown,
      currentNoteConflict,
      currentNote,
      displayedSelectedNoteId,
      editorFocusMode,
      isDeletePublishedNotePending,
      isCreatingNote,
      notebooks,
      isPublishNotePending,
      isPublishShortNotePending,
      searchQuery,
      selectedNoteId,
      setDeletePublishDialogOpen,
      setDraft,
      setEditorFocusMode,
      setPublishDialogOpen,
      setPublishShortNoteDialogOpen,
      syncEditorRevision,
    ],
  );

  // Freeze editor pane props while React Query is showing placeholder data
  // from the previous note, so the old note's content doesn't flash.
  const editorPanePropsRef = useRef(nextEditorPaneProps);
  if (!noteQuery.isPlaceholderData) {
    editorPanePropsRef.current = nextEditorPaneProps;
  }
  const editorPaneProps = noteQuery.isPlaceholderData
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

  const currentNoteId = currentNote?.id ?? null;
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

  const isMutatingNote =
    archiveNoteMutation.isPending ||
    restoreNoteMutation.isPending ||
    deleteNotePermanentlyMutation.isPending ||
    assignNoteNotebookMutation.isPending ||
    pinNoteMutation.isPending ||
    unpinNoteMutation.isPending ||
    duplicateNoteMutation.isPending ||
    setNoteReadonlyMutation.isPending;

  const notesPaneProps = useMemo(
    () => ({
      activeNotebook,
      activeTags,
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
      notebooks,
      noteFilter,
      onAssignNoteNotebook: (noteId: string, notebookId: string | null) =>
        latestRef.current.handleAssignNoteNotebook(noteId, notebookId),
      onArchiveNote: (noteId: string) =>
        latestRef.current.handleArchiveNote(noteId),
      onChangeSearch: setSearchQuery,
      onCopyNoteContent: (noteId: string) =>
        latestRef.current.handleCopyNoteContent(noteId),
      onCreateNote: (source: "keyboard" | "pointer") =>
        latestRef.current.handleCreateNote(source),
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
      activeNotebook,
      activeTags,
      creatingSelectedNoteId,
      currentNotes,
      displayedSelectedNoteId,
      isCreatingNote,
      isMutatingNote,
      notebooks,
      noteFilter,
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
      activeNotebookId,
      activeTags,
      availableTags,
      editingNotebookId,
      isCreatingNotebook,
      newNotebookName,
      archivedCount: bootstrapQuery.data?.archivedCount ?? 0,
      todoCount: todoCountQuery.data ?? 0,
      trashedCount: bootstrapQuery.data?.trashedCount ?? 0,
      noteFilter,
      notebooks,
      onChangeNotebookName: setNewNotebookName,
      onChangeRenamingNotebookName: setRenamingNotebookName,
      onCreateNotebook: () => latestRef.current.submitNotebook(),
      onDeleteNotebook: (notebookId: string) =>
        latestRef.current.handleDeleteNotebook(notebookId),
      onHideCreateNotebook: hideCreateNotebook,
      onHideRenameNotebook: hideRenameNotebook,
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
      onSelectArchive: () => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectArchive();
      },
      onSelectTrash: () => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectTrash();
      },
      onEmptyTrash: () => latestRef.current.handleEmptyTrash(),
      onSelectNotebook: (notebookId: string) => {
        setFocusedPane("sidebar");
        latestRef.current.handleSelectNotebook(notebookId);
      },
      onShowCreateNotebook: showCreateNotebook,
      onShowRenameNotebook: (notebookId: string) =>
        showRenameNotebook(notebookId, notebooks),
      onSubmitRenameNotebook: () => latestRef.current.submitRenameNotebook(),
      onToggleTag: (tag: string) => latestRef.current.handleToggleTag(tag),
      renameNotebookDisabled:
        renameNotebookMutation.isPending || deleteNotebookMutation.isPending,
      renamingNotebookName,
    }),
    [
      activeNotebookId,
      activeTags,
      availableTags,
      bootstrapQuery.data?.archivedCount,
      bootstrapQuery.data?.trashedCount,
      deleteNotebookMutation.isPending,
      editingNotebookId,
      hideCreateNotebook,
      hideRenameNotebook,
      isCreatingNotebook,
      newNotebookName,
      noteFilter,
      notebooks,
      renameNotebookMutation.isPending,
      renamingNotebookName,
      setFocusedPane,
      setNewNotebookName,
      setRenamingNotebookName,
      showCreateNotebook,
      showRenameNotebook,
      todoCountQuery.data,
    ],
  );

  return {
    activeNotebookId,
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
    notesPaneProps,
    sidebarPaneProps,
  };
}
