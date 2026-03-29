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

function matchesTagScope(tags: string[], tagPath: string) {
  return tags.some((tag) => tag === tagPath || tag.startsWith(`${tagPath}/`));
}

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
  const [chooseConflictDialogOpen, setChooseConflictDialogOpen] =
    useState(false);
  const [chooseConflictNoteId, setChooseConflictNoteId] = useState<
    string | null
  >(null);
  const [selectedConflictRevisionId, setSelectedConflictRevisionId] = useState<
    string | null
  >(null);
  const [isResolveConflictPending, setIsResolveConflictPending] =
    useState(false);
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
  const noteFilter = useShellStore((state) => state.noteFilter);
  const searchQuery = useShellStore((state) => state.searchQuery);
  const selectedNoteId = useShellStore((state) => state.selectedNoteId);
  const tagViewActive = useShellStore((state) => state.tagViewActive);
  const setDraft = useShellStore((state) => state.setDraft);
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

  // --- Queries ---
  const {
    bootstrapQuery,
    todoCountQuery,
    notesQuery,
    noteQuery,
    noteConflictQuery,
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
      setDraft(noteQuery.data.id, noteQuery.data.markdown);
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
  const currentNoteConflict = selectedNoteId
    ? noteConflictQuery.data
    : undefined;
  const isCurrentNoteConflicted = (currentNoteConflict?.headCount ?? 0) > 1;
  const selectedConflictHead =
    currentNoteConflict?.heads.find(
      (head) => head.revisionId === selectedConflictRevisionId,
    ) ?? null;
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
      setSelectedConflictRevisionId(null);
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

  useEffect(() => {
    if (!currentNote || !currentNoteConflict || !isCurrentNoteConflicted) {
      setSelectedConflictRevisionId(null);
      return;
    }

    if (
      selectedConflictRevisionId &&
      currentNoteConflict.heads.some(
        (head) => head.revisionId === selectedConflictRevisionId,
      )
    ) {
      return;
    }

    setSelectedConflictRevisionId(
      currentNoteConflict.currentRevisionId ??
        currentNoteConflict.heads[0]?.revisionId ??
        null,
    );
  }, [
    currentNote,
    currentNoteConflict,
    isCurrentNoteConflicted,
    selectedConflictRevisionId,
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

  useEffect(() => {
    const handleFocusTagPath = (event: Event) => {
      const customEvent = event as CustomEvent<FocusTagPathDetail>;
      const tagPath = canonicalizeTagPath(customEvent.detail?.tagPath ?? "");
      if (!tagPath) {
        return;
      }

      setFocusedPane("sidebar");
      latestRef.current.handleSelectTagPath(tagPath);
    };

    window.addEventListener(FOCUS_TAG_PATH_EVENT, handleFocusTagPath);
    return () => {
      window.removeEventListener(FOCUS_TAG_PATH_EVENT, handleFocusTagPath);
    };
  }, [setFocusedPane]);

  // --- Handlers ---
  const handleCreateNote = (source: "keyboard" | "pointer") => {
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
    setEditorFocusMode(source === "pointer" ? "pointerup" : "immediate");
    createNoteMutation.mutate({
      tags: tagsForNewNote,
      markdown: effectiveNoteFilter === "todo" ? "- [ ] " : undefined,
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
    setTagViewActive(false);
    setNoteFilter("all");
  };

  const handleSelectToday = () => {
    clearSelectionIfNotActive();
    setTagViewActive(false);
    setNoteFilter("today");
  };

  const handleSelectTodo = () => {
    clearSelectionIfNotActive();
    setTagViewActive(false);
    setNoteFilter("todo");
  };

  const handleSelectPinned = () => {
    clearSelectionIfNotActive();
    setTagViewActive(false);
    setNoteFilter("pinned");
  };

  const handleSelectUntagged = () => {
    clearSelectionIfNotActive();
    setTagViewActive(false);
    setNoteFilter("untagged");
  };

  const handleSelectArchive = () => {
    setSelectedNoteId(null);
    setDraft("", "");
    setTagViewActive(false);
    setNoteFilter("archive");
  };

  const handleSelectTrash = () => {
    setSelectedNoteId(null);
    setDraft("", "");
    setTagViewActive(false);
    setNoteFilter("trash");
  };

  const handleEmptyTrash = () => {
    emptyTrashMutation.mutate();
  };

  const handleSelectTagPath = (tagPath: string) => {
    if (tagViewActive && activeTagPath === tagPath) {
      return;
    }

    if (currentNote && !matchesTagScope(currentNote.tags, tagPath)) {
      setSelectedNoteId(null);
      setDraft("", "");
    }

    setTagViewActive(true);
    setActiveTagPath(tagPath);
  };

  const syncSelectedNoteAfterTagRewrite = async (affectedNoteIds: string[]) => {
    if (!selectedNoteId || !affectedNoteIds.includes(selectedNoteId)) {
      await queryClient.invalidateQueries({ queryKey: ["note"] });
      return;
    }

    const refreshedNote = await loadNote(selectedNoteId);
    queryClient.setQueryData(["note", refreshedNote.id], refreshedNote);
    setDraft(refreshedNote.id, refreshedNote.markdown);
    setSyncEditorRevision((revision) => revision + 1);
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
    async handleResolveCurrentNoteConflict() {
      if (!currentNote) {
        return;
      }

      setIsResolveConflictPending(true);
      if (
        selectedConflictHead?.op !== "del" &&
        draftNoteId === currentNote.id &&
        draftMarkdown !== currentNote.markdown
      ) {
        try {
          await saveNoteMutation.mutateAsync({
            id: currentNote.id,
            markdown: draftMarkdown,
          });
          setChooseConflictDialogOpen(false);
          setChooseConflictNoteId(null);
          return;
        } finally {
          setIsResolveConflictPending(false);
        }
      }

      try {
        await resolveNoteConflict(
          currentNote.id,
          selectedConflictHead?.op === "del",
        );
        setChooseConflictDialogOpen(false);
        setChooseConflictNoteId(null);
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
      } finally {
        setIsResolveConflictPending(false);
      }
    },
    handleLoadConflictHead(revisionId: string, markdown: string | null) {
      if (!currentNote) {
        return;
      }
      setSelectedConflictRevisionId(revisionId);
      if (markdown !== null) {
        setDraft(currentNote.id, markdown);
        setSyncEditorRevision((revision) => revision + 1);
      }
    },
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
      noteId:
        displayedSelectedNoteId || isCreatingNote
          ? (currentNote?.id ?? null)
          : null,
      editorKey: currentNote ? `${currentNote.id}-${syncEditorRevision}` : null,
      pinnedAt: currentNote?.pinnedAt ?? null,
      publishedAt: currentNote?.publishedAt ?? null,
      publishedKind: currentNote?.publishedKind ?? null,
      readonly: currentNote?.readonly ?? false,
      selectedConflictRevisionId,
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
      onLoadConflictHead(revisionId: string, markdown: string | null) {
        latestRef.current.handleLoadConflictHead(revisionId, markdown);
      },
      onResolveConflict() {
        setChooseConflictNoteId(currentNote?.id ?? null);
        setChooseConflictDialogOpen(true);
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
      isPublishNotePending,
      isPublishShortNotePending,
      isResolveConflictPending,
      searchQuery,
      selectedConflictRevisionId,
      selectedNoteId,
      setChooseConflictNoteId,
      setChooseConflictDialogOpen,
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

  const chooseConflictDialogProps = useMemo(
    () => ({
      deleteSelected: selectedConflictHead?.op === "del",
      open: chooseConflictDialogOpen,
      pending: isResolveConflictPending,
      onOpenChange(open: boolean) {
        setChooseConflictDialogOpen(open);
        if (!open) {
          setChooseConflictNoteId(null);
        }
      },
      onConfirm() {
        void latestRef.current
          .handleResolveCurrentNoteConflict()
          .catch(() => {});
      },
    }),
    [
      chooseConflictDialogOpen,
      isResolveConflictPending,
      selectedConflictHead?.op,
      setChooseConflictNoteId,
      setChooseConflictDialogOpen,
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
    notesPaneProps,
    sidebarPaneProps,
  };
}
