import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useAppState } from "~/store";
import type { Notebook } from "$/types/Notebook";

export const useEvents = () => {
  const activeNoteId = useAppState((state) => state.activeNoteId);
  const setActiveNoteId = useAppState((state) => state.setActiveNoteId);

  const activeNotebookId = useAppState((state) => state.activeNotebookId);
  const activeNotebookName = useAppState((state) => state.activeNotebookName);
  const setActiveNotebookId = useAppState((state) => state.setActiveNotebookId);
  const setActiveNotebookName = useAppState(
    (state) => state.setActiveNotebookName,
  );

  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);

  const queryClient = useQueryClient();

  useEffect(() => {
    const noteMovedToTrashHandler = (
      event: Electron.IpcRendererEvent,
      noteId: string,
    ) => {
      if (activeNoteId === noteId) {
        setActiveNoteId(undefined);
      }
      console.log("Note moved to trash:", noteId);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    };

    const cleanup = window.api.onNoteMovedToTrash(noteMovedToTrashHandler);

    return cleanup;
  }, [activeNoteId, queryClient, setActiveNoteId]);

  useEffect(() => {
    const noteDeletedHandler = (
      event: Electron.IpcRendererEvent,
      noteId: string,
    ) => {
      if (activeNoteId === noteId) {
        setActiveNoteId(undefined);
      }
      console.log("Note deleted:", noteId);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    };

    const cleanup = window.api.onNoteDeleted(noteDeletedHandler);

    return cleanup;
  }, [activeNoteId, queryClient, setActiveNoteId]);

  useEffect(() => {
    const noteRestoredHandler = (
      event: Electron.IpcRendererEvent,
      noteId: string,
    ) => {
      console.log("Note restored:", noteId);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    };

    const cleanup = window.api.onNoteRestored(noteRestoredHandler);

    return cleanup;
  }, [queryClient]);

  useEffect(() => {
    const notebookHiddenHandler = (
      event: Electron.IpcRendererEvent,
      notebookId: string,
    ) => {
      if (activeNotebookId === notebookId) {
        setActiveNotebookId("all");
        setActiveNotebookName("all");
        setFeedType("all");
      }
      void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    };

    const cleanup = window.api.onNotebookHidden(notebookHiddenHandler);

    return cleanup;
  }, [
    queryClient,
    activeNotebookId,
    activeNotebookName,
    setFeedType,
    setActiveNotebookId,
    setActiveNotebookName,
  ]);

  useEffect(() => {
    const notebookDeletedHandler = (
      event: Electron.IpcRendererEvent,
      notebookId: string,
    ) => {
      if (activeNotebookId === notebookId) {
        setActiveNotebookId("all");
        setActiveNotebookName("all");
        setFeedType("all");
      }

      void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    };

    const cleanup = window.api.onNotebookDeleted(notebookDeletedHandler);

    return cleanup;
  }, [
    queryClient,
    activeNotebookId,
    activeNotebookName,
    setActiveNotebookId,
    setActiveNotebookName,
    setFeedType,
  ]);

  useEffect(() => {
    const noteMovedToNotebookHandler = (
      event: Electron.IpcRendererEvent,
      noteId: string,
    ) => {
      console.log("Note moved to notebook:", noteId);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    };

    const cleanup = window.api.onNoteMovedToNotebook(
      noteMovedToNotebookHandler,
    );

    return cleanup;
  }, [queryClient]);

  useEffect(() => {
    const sortSettingsUpdatedHandler = (
      event: Electron.IpcRendererEvent,
      settings: {
        sortBy: "createdAt" | "contentUpdatedAt" | "title";
        sortOrder: "asc" | "desc";
      },
    ) => {
      console.log("Sort settings updated:", settings);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    };

    const cleanup = window.api.onSortSettingsUpdated(
      sortSettingsUpdatedHandler,
    );

    return cleanup;
  }, [queryClient]);

  useEffect(() => {
    const notebookSortSettingsUpdatedHandler = (
      event: Electron.IpcRendererEvent,
      notebook: Notebook,
    ) => {
      console.log("Notebook sort settings updated:", notebook);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    };

    const cleanup = window.api.onNotebookSortSettingsUpdated(
      notebookSortSettingsUpdatedHandler,
    );

    return cleanup;
  }, [queryClient]);
};
