import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { listen } from "@tauri-apps/api/event";
import { initAttachmentsBasePath } from "@/lib/attachments";

const PENDING_DRAFT_KEY = "comet-pending-draft";
import { useShellStore } from "@/stores/use-shell-store";
import { defaultNoteSortPrefs, useUIStore } from "@/stores/use-ui-store";

import {
  type AssignNoteNotebookInput,
  type BootstrapPayload,
  type ContextualTagsInput,
  type ContextualTagsPayload,
  type CreateNotebookInput,
  type LoadedNote,
  type NotePagePayload,
  type NoteQueryInput,
  type NoteSortDirection,
  type NoteSortField,
  type PublishNoteInput,
  type RenameNotebookInput,
} from "./types";

const NOTE_PAGE_SIZE = 40;

async function getBootstrap() {
  const [bootstrap] = await Promise.all([
    invoke<BootstrapPayload>("bootstrap"),
    initAttachmentsBasePath(),
  ]);
  return bootstrap;
}

async function queryNotes(input: NoteQueryInput) {
  return invoke<NotePagePayload>("query_notes", { input });
}

async function getContextualTags(input: ContextualTagsInput) {
  return invoke<ContextualTagsPayload>("contextual_tags", { input });
}

async function loadNote(noteId: string) {
  return invoke<LoadedNote>("load_note", { noteId });
}

async function createNote(input: {
  notebookId: string | null;
  tags: string[];
}) {
  return invoke<LoadedNote>("create_note", input);
}

async function saveNote(input: { id: string; markdown: string }) {
  return invoke<LoadedNote>("save_note", { input });
}

async function archiveNote(noteId: string) {
  return invoke<LoadedNote>("archive_note", { noteId });
}

async function restoreNote(noteId: string) {
  return invoke<LoadedNote>("restore_note", { noteId });
}

async function deleteNotePermanently(noteId: string) {
  return invoke("delete_note_permanently", { noteId });
}

async function createNotebook(input: CreateNotebookInput) {
  return invoke("create_notebook", { input });
}

async function renameNotebook(input: RenameNotebookInput) {
  return invoke("rename_notebook", { input });
}

async function deleteNotebook(notebookId: string) {
  return invoke("delete_notebook", { notebookId });
}

async function assignNoteNotebook(input: AssignNoteNotebookInput) {
  return invoke<LoadedNote>("assign_note_notebook", { input });
}

async function pinNote(noteId: string) {
  return invoke<LoadedNote>("pin_note", { noteId });
}

async function unpinNote(noteId: string) {
  return invoke<LoadedNote>("unpin_note", { noteId });
}

type PublishResult = {
  successCount: number;
  failCount: number;
  relayCount: number;
};

async function publishNote(input: PublishNoteInput) {
  return invoke<PublishResult>("publish_note", { input });
}

async function deletePublishedNote(noteId: string) {
  return invoke<PublishResult>("delete_published_note", { noteId });
}

function flattenNotePages(
  data: InfiniteData<NotePagePayload, unknown> | undefined,
) {
  return data?.pages.flatMap((page) => page.notes) ?? [];
}

function nextSelectedNoteIdAfterRemoval(
  notes: NotePagePayload["notes"],
  removedNoteId: string,
) {
  const removedIndex = notes.findIndex((note) => note.id === removedNoteId);
  const remainingNotes = notes.filter((note) => note.id !== removedNoteId);

  if (remainingNotes.length === 0) {
    return null;
  }

  if (removedIndex < 0) {
    return remainingNotes[0]?.id ?? null;
  }

  return (
    remainingNotes[Math.min(removedIndex, remainingNotes.length - 1)]?.id ??
    null
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return fallback;
}

export function useShellController() {
  const [hasHydratedInitialSelection, setHasHydratedInitialSelection] =
    useState(false);
  const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);
  const [isCreatingNoteTransition, setIsCreatingNoteTransition] =
    useState(false);
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(
    null,
  );
  const [creatingSelectedNoteId, setCreatingSelectedNoteId] = useState<
    string | null
  >(null);
  const [syncEditorRevision, setSyncEditorRevision] = useState(0);
  const [editorFocusMode, setEditorFocusMode] = useState<
    "none" | "immediate" | "pointerup"
  >("none");
  const [newNotebookName, setNewNotebookName] = useState("");
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [renamingNotebookName, setRenamingNotebookName] = useState("");
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
      toast.error("Couldn't create note", {
        description: errorMessage(error, "Try again."),
        id: "create-note-error",
      });
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
    onError: (error) => {
      toast.error("Couldn't save note", {
        description: errorMessage(error, "Your latest changes were not saved."),
        id: "save-note-error",
      });
    },
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
    onError: (error) => {
      toast.error("Couldn't archive note", {
        description: errorMessage(error, "Try again."),
        id: "archive-note-error",
      });
    },
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
    onError: (error) => {
      toast.error("Couldn't restore note", {
        description: errorMessage(error, "Try again."),
        id: "restore-note-error",
      });
    },
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
    onError: (error) => {
      toast.error("Couldn't delete note", {
        description: errorMessage(error, "Try again."),
        id: "delete-note-error",
      });
    },
  });

  const createNotebookMutation = useMutation({
    mutationFn: createNotebook,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["notes"] }),
        queryClient.invalidateQueries({ queryKey: ["note"] }),
      ]);
      setIsCreatingNotebook(false);
      setNewNotebookName("");
    },
    onError: (error) => {
      toast.error("Couldn't create notebook", {
        description: errorMessage(error, "Try again."),
        id: "create-notebook-error",
      });
    },
  });

  const renameNotebookMutation = useMutation({
    mutationFn: renameNotebook,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["notes"] }),
        queryClient.invalidateQueries({ queryKey: ["note"] }),
      ]);
      setEditingNotebookId(null);
      setRenamingNotebookName("");
    },
    onError: (error) => {
      toast.error("Couldn't rename notebook", {
        description: errorMessage(error, "Try again."),
        id: "rename-notebook-error",
      });
    },
  });

  const deleteNotebookMutation = useMutation({
    mutationFn: deleteNotebook,
    onSuccess: async (_, notebookId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["notes"] }),
        queryClient.invalidateQueries({ queryKey: ["note"] }),
      ]);

      if (editingNotebookId === notebookId) {
        setEditingNotebookId(null);
        setRenamingNotebookName("");
      }
    },
    onError: (error) => {
      toast.error("Couldn't delete notebook", {
        description: errorMessage(error, "Try again."),
        id: "delete-notebook-error",
      });
    },
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
    onError: (error) => {
      toast.error("Couldn't move note", {
        description: errorMessage(error, "Try again."),
        id: "assign-note-notebook-error",
      });
    },
  });

  const pinNoteMutation = useMutation({
    mutationFn: pinNote,
    onSuccess: (updatedNote) => {
      queryClient.setQueryData(["note", updatedNote.id], updatedNote);
      void invalidateNotes();
    },
    onError: (error) => {
      toast.error("Couldn't pin note", {
        description: errorMessage(error, "Try again."),
        id: "pin-note-error",
      });
    },
  });

  const unpinNoteMutation = useMutation({
    mutationFn: unpinNote,
    onSuccess: (updatedNote) => {
      queryClient.setQueryData(["note", updatedNote.id], updatedNote);
      void invalidateNotes();
    },
    onError: (error) => {
      toast.error("Couldn't unpin note", {
        description: errorMessage(error, "Try again."),
        id: "unpin-note-error",
      });
    },
  });

  const publishNoteMutation = useMutation({
    mutationFn: publishNote,
    onSuccess: (result, input) => {
      setPublishDialogOpen(false);
      toast.success(
        `Published to ${result.successCount} of ${result.relayCount} relay${result.relayCount === 1 ? "" : "s"}`,
        { id: "publish-note-success" },
      );
      void queryClient.invalidateQueries({ queryKey: ["note", input.noteId] });
    },
    onError: (error) => {
      toast.error("Couldn't publish note", {
        description: errorMessage(error, "Try again."),
        id: "publish-note-error",
      });
    },
  });

  const [deletePublishDialogOpen, setDeletePublishDialogOpen] = useState(false);

  const deletePublishedNoteMutation = useMutation({
    mutationFn: deletePublishedNote,
    onSuccess: (result, noteId) => {
      setDeletePublishDialogOpen(false);
      toast.success(
        `Deleted from ${result.successCount} of ${result.relayCount} relay${result.relayCount === 1 ? "" : "s"}`,
        { id: "delete-published-note-success" },
      );
      void queryClient.invalidateQueries({ queryKey: ["note", noteId] });
    },
    onError: (error) => {
      toast.error("Couldn't delete published note", {
        description: errorMessage(error, "Try again."),
        id: "delete-published-note-error",
      });
    },
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
        invoke("save_note", { input: { id: noteId, markdown } }).then(() => {
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
        if (action === "delete") {
          queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
        }
        // If the updated note is currently open, refetch it then
        // remount the editor with new content
        const { draftNoteId: currentDraftId } = useShellStore.getState();
        if (currentDraftId === noteId && action === "upsert") {
          queryClient
            .refetchQueries({ queryKey: ["note", noteId] })
            .then(() => {
              useShellStore.getState().setDraft("", "");
              setSyncEditorRevision((r) => r + 1);
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

  const handleSelectAll = () => {
    setNoteFilter("all");
  };

  const handleSelectToday = () => {
    setNoteFilter("today");
  };

  const handleSelectArchive = () => {
    setNoteFilter("archive");
  };

  const handleSelectNotebook = (notebookId: string) => {
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

  const handleDeleteNotePermanently = (noteId: string) => {
    void (async () => {
      if (
        archiveNoteMutation.isPending ||
        restoreNoteMutation.isPending ||
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
        toast.error("Couldn't copy note", {
          description: errorMessage(error, "Try again."),
          id: "copy-note-error",
        });
      }
    })();
  };

  const submitNotebook = () => {
    const name = newNotebookName.trim();
    if (!name || createNotebookMutation.isPending) {
      return;
    }

    createNotebookMutation.mutate({ name });
  };

  const submitRenameNotebook = () => {
    const name = renamingNotebookName.trim();
    if (!editingNotebookId || !name || renameNotebookMutation.isPending) {
      return;
    }

    renameNotebookMutation.mutate({
      name,
      notebookId: editingNotebookId,
    });
  };

  const handleDeleteNotebook = (notebookId: string) => {
    if (
      createNotebookMutation.isPending ||
      renameNotebookMutation.isPending ||
      deleteNotebookMutation.isPending
    ) {
      return;
    }

    deleteNotebookMutation.mutate(notebookId);
  };

  return {
    activeNotebookId,
    bootstrapError:
      bootstrapQuery.isError && bootstrapQuery.error instanceof Error
        ? bootstrapQuery.error.message
        : bootstrapQuery.isError
          ? "Failed to load the note library."
          : null,
    bootstrapLoading: bootstrapQuery.isLoading,
    readyToRevealWindow,
    retryBootstrap() {
      void bootstrapQuery.refetch();
      void invalidateNotes();
      void invalidateContextualTags();
    },
    editorPaneProps: {
      archivedAt: currentNote?.archivedAt ?? null,
      focusMode:
        currentNote && currentNote.id === selectedNoteId
          ? editorFocusMode
          : "none",
      isNewNote: currentNote?.id === creatingSelectedNoteId,
      markdown: currentEditorMarkdown,
      modifiedAt: currentNote?.modifiedAt ?? 0,
      notebook: currentNote?.notebook ?? null,
      notebooks,
      noteId: currentNote?.id ?? null,
      editorKey: currentNote ? `${currentNote.id}-${syncEditorRevision}` : null,
      pinnedAt: currentNote?.pinnedAt ?? null,
      publishedAt: currentNote?.publishedAt ?? null,
      searchQuery,
      isDeletePublishedNotePending: deletePublishedNoteMutation.isPending,
      onAssignNotebook(notebookId: string | null) {
        if (currentNote) {
          handleAssignNoteNotebook(currentNote.id, notebookId);
        }
      },
      onDeletePublishedNote() {
        if (
          !currentNote ||
          deletePublishedNoteMutation.isPending ||
          !currentNote.publishedAt
        ) {
          return;
        }

        setDeletePublishDialogOpen(true);
      },
      onOpenPublishDialog() {
        if (!currentNote || publishNoteMutation.isPending) {
          return;
        }

        void (async () => {
          await flushCurrentDraftAsync();
          setPublishDialogOpen(true);
        })().catch(() => {});
      },
      onSetPinned(pinned: boolean) {
        if (currentNote) {
          handleSetNotePinned(currentNote.id, pinned);
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
    },
    publishDialogProps: {
      initialTitle: currentNote?.title ?? "",
      initialTags: currentNote?.tags ?? [],
      noteId: currentNote?.id ?? "",
      open: publishDialogOpen,
      pending: publishNoteMutation.isPending,
      onOpenChange: setPublishDialogOpen,
      onSubmit(input: PublishNoteInput) {
        publishNoteMutation.mutate(input);
      },
    },
    deletePublishDialogProps: {
      open: deletePublishDialogOpen,
      pending: deletePublishedNoteMutation.isPending,
      onOpenChange: setDeletePublishDialogOpen,
      onConfirm() {
        if (currentNote) {
          deletePublishedNoteMutation.mutate(currentNote.id);
        }
      },
    },
    notesPaneProps: {
      activeNotebook,
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
      isMutatingNote:
        archiveNoteMutation.isPending ||
        restoreNoteMutation.isPending ||
        deleteNotePermanentlyMutation.isPending ||
        assignNoteNotebookMutation.isPending ||
        pinNoteMutation.isPending ||
        unpinNoteMutation.isPending,
      notebooks,
      noteFilter,
      onAssignNoteNotebook: handleAssignNoteNotebook,
      onArchiveNote: handleArchiveNote,
      onChangeSearch: setSearchQuery,
      onCopyNoteContent: handleCopyNoteContent,
      onCreateNote: handleCreateNote,
      onDeleteNotePermanently: handleDeleteNotePermanently,
      onLoadMore() {
        if (notesQuery.hasNextPage && !notesQuery.isFetchingNextPage) {
          void notesQuery.fetchNextPage();
        }
      },
      onRestoreNote: handleRestoreNote,
      onSelectNote: handleSelectNote,
      onSetNotePinned: handleSetNotePinned,
      searchQuery,
      selectedNoteId: displayedSelectedNoteId,
    },
    sidebarPaneProps: {
      activeNotebookId,
      activeTags,
      availableTags,
      editingNotebookId,
      isCreatingNotebook,
      newNotebookName,
      noteFilter,
      notebooks,
      onChangeNotebookName: setNewNotebookName,
      onChangeRenamingNotebookName: setRenamingNotebookName,
      onCreateNotebook: submitNotebook,
      onDeleteNotebook: handleDeleteNotebook,
      onHideCreateNotebook() {
        setIsCreatingNotebook(false);
        setNewNotebookName("");
      },
      onHideRenameNotebook() {
        setEditingNotebookId(null);
        setRenamingNotebookName("");
      },
      onSelectAll: handleSelectAll,
      onSelectToday: handleSelectToday,
      onSelectArchive: handleSelectArchive,
      onSelectNotebook: handleSelectNotebook,
      onShowCreateNotebook() {
        setEditingNotebookId(null);
        setRenamingNotebookName("");
        setIsCreatingNotebook(true);
      },
      onShowRenameNotebook(notebookId: string) {
        const notebook = notebooks.find((item) => item.id === notebookId);
        if (!notebook) {
          return;
        }

        setIsCreatingNotebook(false);
        setNewNotebookName("");
        setEditingNotebookId(notebookId);
        setRenamingNotebookName(notebook.name);
      },
      onSubmitRenameNotebook: submitRenameNotebook,
      onToggleTag: handleToggleTag,
      renameNotebookDisabled:
        renameNotebookMutation.isPending || deleteNotebookMutation.isPending,
      renamingNotebookName,
    },
  };
}
