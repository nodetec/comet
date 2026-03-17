import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { toastErrorHandler } from "@/lib/mutation-utils";
import { errorMessage } from "@/lib/utils";
import { useShellStore } from "@/stores/use-shell-store";
import { defaultNoteSortPrefs, useUIStore } from "@/stores/use-ui-store";

import {
  archiveNote,
  assignNoteNotebook,
  createNote,
  deleteNotePermanently,
  emptyTrash,
  getBootstrap,
  getContextualTags,
  loadNote,
  NOTE_PAGE_SIZE,
  PENDING_DRAFT_KEY,
  pinNote,
  queryNotes,
  restoreNote,
  restoreFromTrash,
  saveNote,
  exportNotes,
  trashNote,
  unpinNote,
} from "./api";
import {
  type LoadedNote,
  type NoteQueryInput,
  type NoteSortDirection,
  type NoteSortField,
  type PublishNoteInput,
  type PublishShortNoteInput,
} from "./types";
import { useNotebookState } from "./use-notebook-state";
import { usePublishState } from "./use-publish-state";
import { flattenNotePages, nextSelectedNoteIdAfterRemoval } from "./utils";

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
  const pendingSaveTimeoutRef = useRef<number | null>(null);

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

  const sortViewKey =
    noteFilter === "notebook" ? (activeNotebookId ?? "all") : noteFilter;
  const sortPrefs =
    useUIStore((state) => state.noteSortPrefs[sortViewKey]) ??
    defaultNoteSortPrefs;
  const setNoteSortPrefs = useUIStore((state) => state.setNoteSortPrefs);
  const noteSortField = sortPrefs.field;
  const noteSortDirection = sortPrefs.direction;

  const normalizedQuery = searchQuery.trim();
  const normalizedActiveTags = useMemo(
    () => [...activeTags].sort((left, right) => left.localeCompare(right)),
    [activeTags],
  );

  const bootstrapQuery = useQuery({
    queryKey: ["bootstrap"],
    queryFn: getBootstrap,
  });

  const notebooks = bootstrapQuery.data?.notebooks ?? [];
  const activeNotebook =
    notebooks.find((notebook) => notebook.id === activeNotebookId) ?? null;
  const initialSelectedNoteId = bootstrapQuery.data?.selectedNoteId ?? null;
  const isDefaultNotesView =
    noteFilter === "all" &&
    activeNotebookId === null &&
    normalizedQuery === "" &&
    normalizedActiveTags.length === 0 &&
    noteSortField === "modified_at" &&
    noteSortDirection === "newest";
  const notesQueryInput = useMemo<NoteQueryInput>(
    () => ({
      activeNotebookId: noteFilter === "notebook" ? activeNotebookId : null,
      activeTags: normalizedActiveTags,
      limit: NOTE_PAGE_SIZE,
      noteFilter,
      offset: 0,
      searchQuery: normalizedQuery,
      sortField: noteSortField,
      sortDirection: noteSortDirection,
    }),
    [
      activeNotebookId,
      normalizedActiveTags,
      normalizedQuery,
      noteFilter,
      noteSortField,
      noteSortDirection,
    ],
  );
  const notesQueryKey = useMemo(
    () => [
      "notes",
      noteFilter,
      noteFilter === "notebook" ? (activeNotebookId ?? "") : "",
      normalizedQuery,
      normalizedActiveTags.join("\u0000"),
      noteSortField,
      noteSortDirection,
    ],
    [
      activeNotebookId,
      normalizedActiveTags,
      normalizedQuery,
      noteFilter,
      noteSortField,
      noteSortDirection,
    ],
  );
  const notesQuery = useInfiniteQuery({
    enabled: bootstrapQuery.isSuccess,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialData:
      isDefaultNotesView && bootstrapQuery.data
        ? {
            pageParams: [0],
            pages: [bootstrapQuery.data.initialNotes],
          }
        : undefined,
    initialPageParam: 0,
    placeholderData: (previousData) => previousData,
    queryFn: ({ pageParam }) =>
      queryNotes({
        ...notesQueryInput,
        offset: pageParam,
      }),
    queryKey: notesQueryKey,
  });
  const currentNotes = useMemo(
    () => flattenNotePages(notesQuery.data),
    [notesQuery.data],
  );

  const contextualTagsQuery = useQuery({
    enabled: bootstrapQuery.isSuccess,
    initialData:
      noteFilter === "all" && activeNotebookId === null && bootstrapQuery.data
        ? bootstrapQuery.data.initialTags
        : undefined,
    placeholderData: (previousData) => previousData,
    queryFn: () =>
      getContextualTags({
        activeNotebookId: noteFilter === "notebook" ? activeNotebookId : null,
        noteFilter,
      }),
    queryKey: [
      "contextual-tags",
      noteFilter,
      noteFilter === "notebook" ? (activeNotebookId ?? "") : "",
    ],
  });
  const availableTags = contextualTagsQuery.data?.tags ?? [];

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

  const noteQuery = useQuery({
    enabled: Boolean(selectedNoteId),
    placeholderData: (previousData) => previousData,
    queryFn: () => loadNote(selectedNoteId!),
    queryKey: ["note", selectedNoteId],
  });

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

  useEffect(() => {
    if (noteQuery.data && noteQuery.data.id !== draftNoteId) {
      setDraft(noteQuery.data.id, noteQuery.data.markdown);
    }
  }, [draftNoteId, noteQuery.data, setDraft]);

  const invalidateNotes = async () => {
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  const invalidateContextualTags = async () => {
    await queryClient.invalidateQueries({ queryKey: ["contextual-tags"] });
  };

  const invalidateShellData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      invalidateNotes(),
      invalidateContextualTags(),
    ]);
  };

  const flushCurrentDraft = () => {
    if (!currentNote || draftNoteId !== currentNote.id) {
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

  const createNoteMutation = useMutation({
    mutationFn: createNote,
    onSuccess: (note) => {
      queryClient.setQueryData(["note", note.id], note);
      setCreatingSelectedNoteId(note.id);
      setSelectedNoteId(note.id);
      setDraft(note.id, note.markdown);
      setIsCreatingNoteTransition(false);
      void Promise.all([invalidateNotes(), invalidateContextualTags()]);
    },
    onError: (error) => {
      setCreatingSelectedNoteId(null);
      setIsCreatingNoteTransition(false);
      setEditorFocusMode("none");
      toastErrorHandler("Couldn't create note", "create-note-error")(error);
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: saveNote,
    onSuccess: (savedNote) => {
      queryClient.setQueryData(["note", savedNote.id], savedNote);
      void Promise.all([invalidateNotes(), invalidateContextualTags()]);
      try {
        localStorage.removeItem(PENDING_DRAFT_KEY);
      } catch {
        // Ignore
      }
    },
    onError: toastErrorHandler(
      "Couldn't save note",
      "save-note-error",
      "Your latest changes were not saved.",
    ),
  });

  const archiveNoteMutation = useMutation({
    mutationFn: archiveNote,
    onSuccess: (archivedNote) => {
      queryClient.setQueryData(["note", archivedNote.id], archivedNote);

      if (selectedNoteId === archivedNote.id && noteFilter !== "archive") {
        setSelectedNoteId(
          nextSelectedNoteIdAfterRemoval(currentNotes, archivedNote.id),
        );
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler("Couldn't archive note", "archive-note-error"),
  });

  const restoreNoteMutation = useMutation({
    mutationFn: restoreNote,
    onSuccess: (restoredNote) => {
      queryClient.setQueryData(["note", restoredNote.id], restoredNote);

      if (selectedNoteId === restoredNote.id && noteFilter === "archive") {
        setSelectedNoteId(
          nextSelectedNoteIdAfterRemoval(currentNotes, restoredNote.id),
        );
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler("Couldn't restore note", "restore-note-error"),
  });

  const trashNoteMutation = useMutation({
    mutationFn: trashNote,
    onSuccess: (trashedNote) => {
      queryClient.setQueryData(["note", trashedNote.id], trashedNote);

      if (selectedNoteId === trashedNote.id && noteFilter !== "trash") {
        setSelectedNoteId(
          nextSelectedNoteIdAfterRemoval(currentNotes, trashedNote.id),
        );
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler("Couldn't delete note", "trash-note-error"),
  });

  const restoreFromTrashMutation = useMutation({
    mutationFn: restoreFromTrash,
    onSuccess: (restoredNote) => {
      queryClient.setQueryData(["note", restoredNote.id], restoredNote);

      if (selectedNoteId === restoredNote.id && noteFilter === "trash") {
        setSelectedNoteId(
          nextSelectedNoteIdAfterRemoval(currentNotes, restoredNote.id),
        );
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler(
      "Couldn't restore note",
      "restore-from-trash-error",
    ),
  });

  const deleteNotePermanentlyMutation = useMutation({
    mutationFn: deleteNotePermanently,
    onSuccess: (_, noteId) => {
      queryClient.removeQueries({ exact: true, queryKey: ["note", noteId] });

      if (draftNoteId === noteId) {
        setDraft("", "");
      }

      if (selectedNoteId === noteId) {
        setSelectedNoteId(nextSelectedNoteIdAfterRemoval(currentNotes, noteId));
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler("Couldn't delete note", "delete-note-error"),
  });

  const emptyTrashMutation = useMutation({
    mutationFn: emptyTrash,
    onSuccess: () => {
      setSelectedNoteId(null);
      setDraft("", "");
      void invalidateShellData();
    },
    onError: toastErrorHandler("Couldn't empty trash", "empty-trash-error"),
  });

  const assignNoteNotebookMutation = useMutation({
    mutationFn: assignNoteNotebook,
    onSuccess: (updatedNote) => {
      queryClient.setQueryData(["note", updatedNote.id], updatedNote);

      if (
        selectedNoteId === updatedNote.id &&
        noteFilter === "notebook" &&
        activeNotebookId &&
        updatedNote.notebook?.id !== activeNotebookId
      ) {
        setSelectedNoteId(
          nextSelectedNoteIdAfterRemoval(currentNotes, updatedNote.id),
        );
      }

      void invalidateShellData();
    },
    onError: toastErrorHandler(
      "Couldn't move note",
      "assign-note-notebook-error",
    ),
  });

  const pinNoteMutation = useMutation({
    mutationFn: pinNote,
    onSuccess: (updatedNote) => {
      queryClient.setQueryData(["note", updatedNote.id], updatedNote);
      void invalidateNotes();
    },
    onError: toastErrorHandler("Couldn't pin note", "pin-note-error"),
  });

  const unpinNoteMutation = useMutation({
    mutationFn: unpinNote,
    onSuccess: (updatedNote) => {
      queryClient.setQueryData(["note", updatedNote.id], updatedNote);
      void invalidateNotes();
    },
    onError: toastErrorHandler("Couldn't unpin note", "unpin-note-error"),
  });

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
  const currentEditorMarkdown = currentNote
    ? draftNoteId === currentNote.id
      ? draftMarkdown
      : currentNote.markdown
    : "";

  // Recover any draft that was pending when the app quit
  useEffect(() => {
    if (!bootstrapQuery.isSuccess) return;
    try {
      const raw = localStorage.getItem(PENDING_DRAFT_KEY);
      if (!raw) return;
      const { noteId, markdown } = JSON.parse(raw) as {
        noteId: string;
        markdown: string;
      };
      if (noteId && markdown) {
        saveNote({ id: noteId, markdown }).then(() => {
          localStorage.removeItem(PENDING_DRAFT_KEY);
          queryClient.invalidateQueries({ queryKey: ["note", noteId] });
          queryClient.invalidateQueries({ queryKey: ["notes"] });
        });
      }
    } catch {
      localStorage.removeItem(PENDING_DRAFT_KEY);
    }
  }, [bootstrapQuery.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invalidate queries when a remote sync change arrives
  useEffect(() => {
    const unlisten = listen<{ noteId: string; action: string }>(
      "sync-remote-change",
      (event) => {
        const { noteId, action } = event.payload;
        queryClient.invalidateQueries({ queryKey: ["notes"] });
        queryClient.invalidateQueries({ queryKey: ["note", noteId] });
        queryClient.invalidateQueries({ queryKey: ["contextual-tags"] });
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
        // If the updated note is currently open, refetch then remount editor
        // — but only if the user isn't actively editing (unsaved draft)
        const { draftNoteId: currentDraftId } = useShellStore.getState();
        const hasPendingSave = Boolean(pendingSaveTimeoutRef.current);

        // If the currently open note was deleted remotely, close the editor
        if (action === "delete") {
          const { selectedNoteId: currentSelectedId } =
            useShellStore.getState();
          if (currentDraftId === noteId || currentSelectedId === noteId) {
            queryClient.removeQueries({
              exact: true,
              queryKey: ["note", noteId],
            });
            useShellStore.getState().setDraft("", "");
            useShellStore.getState().setSelectedNoteId(null);
            setSyncEditorRevision((r) => r + 1);
          }
          return;
        }

        if (
          currentDraftId === noteId &&
          action === "upsert" &&
          !hasPendingSave
        ) {
          queryClient
            .fetchQuery({
              queryKey: ["note", noteId],
              queryFn: () => loadNote(noteId),
            })
            .then((freshNote) => {
              if (freshNote) {
                queryClient.setQueryData(["note", noteId], freshNote);
                const { draftMarkdown: currentDraft } =
                  useShellStore.getState();
                if (freshNote.markdown !== currentDraft) {
                  useShellStore.getState().setDraft("", "");
                  setSyncEditorRevision((r) => r + 1);
                }
              }
            });
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient]);

  useEffect(() => {
    if (!currentNote || draftNoteId !== currentNote.id) {
      return;
    }

    if (saveNoteMutation.isPending || draftMarkdown === currentNote.markdown) {
      return;
    }

    console.log(
      "[save-debounce] draft diverged from stored, scheduling save —",
      "stored length:",
      currentNote.markdown.length,
      "draft length:",
      draftMarkdown.length,
    );

    // Persist draft for crash recovery (survives app quit during debounce)
    try {
      localStorage.setItem(
        PENDING_DRAFT_KEY,
        JSON.stringify({ noteId: currentNote.id, markdown: draftMarkdown }),
      );
    } catch {
      // Ignore storage errors
    }

    pendingSaveTimeoutRef.current = window.setTimeout(() => {
      saveNoteMutation.mutate({
        id: currentNote.id,
        markdown: draftMarkdown,
      });
    }, 3000);

    return () => {
      if (pendingSaveTimeoutRef.current !== null) {
        window.clearTimeout(pendingSaveTimeoutRef.current);
        pendingSaveTimeoutRef.current = null;
      }
    };
  }, [currentNote, draftMarkdown, draftNoteId, saveNoteMutation]);

  const handleCreateNote = (source: "keyboard" | "pointer") => {
    if (isCreatingNote) {
      return;
    }

    flushCurrentDraft();
    const tagsForNewNote = [...activeTags];
    if (noteFilter !== "notebook" && noteFilter !== "today") {
      setNoteFilter("all");
    }
    setSearchQuery("");
    setCreatingSelectedNoteId(null);
    setIsCreatingNoteTransition(true);
    setEditorFocusMode(source === "pointer" ? "pointerup" : "immediate");
    createNoteMutation.mutate({
      notebookId: noteFilter === "notebook" ? activeNotebookId : null,
      tags: tagsForNewNote,
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
      unpinNoteMutation.isPending
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
      unpinNoteMutation.isPending
    ) {
      return;
    }

    const mutation = pinned ? pinNoteMutation : unpinNoteMutation;
    void mutation.mutateAsync(noteId).catch(() => {});
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
    handleDeleteNotebook: notebook.handleDeleteNotebook,
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
    handleSetNotePinned,
    handleToggleTag,
    submitNotebook: notebook.submitNotebook,
    submitRenameNotebook: notebook.submitRenameNotebook,
  };
  const latestRef = useRef(currentHandlers);
  latestRef.current = currentHandlers;

  const editorPaneProps = useMemo(
    () => ({
      archivedAt: currentNote?.archivedAt ?? null,
      deletedAt: currentNote?.deletedAt ?? null,
      focusMode:
        currentNote && currentNote.id === selectedNoteId
          ? editorFocusMode
          : ("none" as const),
      isNewNote: currentNote?.id === creatingSelectedNoteId,
      markdown: currentEditorMarkdown,
      modifiedAt: currentNote?.modifiedAt ?? 0,
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
      searchQuery,
      isDeletePublishedNotePending:
        publish.deletePublishedNoteMutation.isPending,
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
          publish.deletePublishedNoteMutation.isPending ||
          !currentNote.publishedAt
        ) {
          return;
        }

        publish.setDeletePublishDialogOpen(true);
      },
      onOpenPublishDialog() {
        if (!currentNote || publish.publishNoteMutation.isPending) {
          return;
        }

        void (async () => {
          await latestRef.current.flushCurrentDraftAsync();
          publish.setPublishDialogOpen(true);
        })().catch(() => {});
      },
      onPublishShortNote() {
        if (!currentNote || publish.publishShortNoteMutation.isPending) {
          return;
        }

        void (async () => {
          await latestRef.current.flushCurrentDraftAsync();
          publish.setPublishShortNoteDialogOpen(true);
        })().catch(() => {});
      },
      onSetPinned(pinned: boolean) {
        if (currentNote) {
          latestRef.current.handleSetNotePinned(currentNote.id, pinned);
        }
      },
      onChange(markdown: string) {
        if (currentNote && !currentNote.archivedAt) {
          setDraft(currentNote.id, markdown);
        }
      },
      onFocusHandled() {
        setEditorFocusMode("none");
      },
    }),
    [
      creatingSelectedNoteId,
      currentEditorMarkdown,
      currentNote,
      publish.deletePublishedNoteMutation.isPending,
      editorFocusMode,
      notebooks,
      publish.publishNoteMutation.isPending,
      searchQuery,
      selectedNoteId,
      setDraft,
      setEditorFocusMode,
      syncEditorRevision,
    ],
  );

  const publishDialogProps = useMemo(
    () => ({
      initialTitle: currentNote?.title ?? "",
      initialTags: currentNote?.tags ?? [],
      noteId: currentNote?.id ?? "",
      open: publish.publishDialogOpen,
      pending: publish.publishNoteMutation.isPending,
      onOpenChange: publish.setPublishDialogOpen,
      onSubmit(input: PublishNoteInput) {
        publish.publishNoteMutation.mutate(input);
      },
    }),
    [
      currentNote?.id,
      currentNote?.tags,
      currentNote?.title,
      publish.publishDialogOpen,
      publish.publishNoteMutation.isPending,
      publish.publishNoteMutation.mutate,
    ],
  );

  const publishShortNoteDialogProps = useMemo(
    () => ({
      content: currentEditorMarkdown.replace(/^#\s+.*\n*/, "").trim(),
      initialTags: currentNote?.tags ?? [],
      noteId: currentNote?.id ?? "",
      open: publish.publishShortNoteDialogOpen,
      pending: publish.publishShortNoteMutation.isPending,
      onOpenChange: publish.setPublishShortNoteDialogOpen,
      onSubmit(input: PublishShortNoteInput) {
        publish.publishShortNoteMutation.mutate(input);
      },
    }),
    [
      currentEditorMarkdown,
      currentNote?.id,
      currentNote?.tags,
      publish.publishShortNoteDialogOpen,
      publish.publishShortNoteMutation.isPending,
      publish.publishShortNoteMutation.mutate,
    ],
  );

  const currentNoteId = currentNote?.id ?? null;
  const deletePublishDialogProps = useMemo(
    () => ({
      open: publish.deletePublishDialogOpen,
      pending: publish.deletePublishedNoteMutation.isPending,
      onOpenChange: publish.setDeletePublishDialogOpen,
      onConfirm() {
        if (currentNoteId) {
          publish.deletePublishedNoteMutation.mutate(currentNoteId);
        }
      },
    }),
    [
      currentNoteId,
      publish.deletePublishDialogOpen,
      publish.deletePublishedNoteMutation.isPending,
      publish.deletePublishedNoteMutation.mutate,
    ],
  );

  const isMutatingNote =
    archiveNoteMutation.isPending ||
    restoreNoteMutation.isPending ||
    deleteNotePermanentlyMutation.isPending ||
    assignNoteNotebookMutation.isPending ||
    pinNoteMutation.isPending ||
    unpinNoteMutation.isPending;

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
      onSelectNote: (noteId: string) =>
        latestRef.current.handleSelectNote(noteId),
      onSetNotePinned: (noteId: string, pinned: boolean) =>
        latestRef.current.handleSetNotePinned(noteId, pinned),
      searchQuery,
      selectedNoteId: displayedSelectedNoteId,
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
      setNoteSortPrefs,
      setSearchQuery,
      sortViewKey,
    ],
  );

  const sidebarPaneProps = useMemo(
    () => ({
      activeNotebookId,
      activeTags,
      availableTags,
      editingNotebookId: notebook.editingNotebookId,
      isCreatingNotebook: notebook.isCreatingNotebook,
      newNotebookName: notebook.newNotebookName,
      archivedCount: bootstrapQuery.data?.archivedCount ?? 0,
      trashedCount: bootstrapQuery.data?.trashedCount ?? 0,
      noteFilter,
      notebooks,
      onChangeNotebookName: notebook.setNewNotebookName,
      onChangeRenamingNotebookName: notebook.setRenamingNotebookName,
      onCreateNotebook: () => latestRef.current.submitNotebook(),
      onDeleteNotebook: (notebookId: string) =>
        latestRef.current.handleDeleteNotebook(notebookId),
      onHideCreateNotebook: notebook.hideCreateNotebook,
      onHideRenameNotebook: notebook.hideRenameNotebook,
      onSelectAll: () => latestRef.current.handleSelectAll(),
      onSelectToday: () => latestRef.current.handleSelectToday(),
      onSelectArchive: () => latestRef.current.handleSelectArchive(),
      onSelectTrash: () => latestRef.current.handleSelectTrash(),
      onEmptyTrash: () => latestRef.current.handleEmptyTrash(),
      onSelectNotebook: (notebookId: string) =>
        latestRef.current.handleSelectNotebook(notebookId),
      onShowCreateNotebook: notebook.showCreateNotebook,
      onShowRenameNotebook: (notebookId: string) =>
        notebook.showRenameNotebook(notebookId, notebooks),
      onSubmitRenameNotebook: () => latestRef.current.submitRenameNotebook(),
      onToggleTag: (tag: string) => latestRef.current.handleToggleTag(tag),
      renameNotebookDisabled:
        notebook.renameNotebookMutation.isPending ||
        notebook.deleteNotebookMutation.isPending,
      renamingNotebookName: notebook.renamingNotebookName,
    }),
    [
      activeNotebookId,
      activeTags,
      availableTags,
      bootstrapQuery.data?.archivedCount,
      bootstrapQuery.data?.trashedCount,
      notebook.deleteNotebookMutation.isPending,
      notebook.editingNotebookId,
      notebook.isCreatingNotebook,
      notebook.newNotebookName,
      noteFilter,
      notebooks,
      notebook.renameNotebookMutation.isPending,
      notebook.renamingNotebookName,
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
