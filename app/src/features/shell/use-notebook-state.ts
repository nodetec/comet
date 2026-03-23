import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toastErrorHandler } from "@/shared/lib/mutation-utils";

import { createNotebook, deleteNotebook, renameNotebook } from "./api";
import { type NotebookSummary } from "./types";

export function useNotebookState() {
  const queryClient = useQueryClient();
  const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(
    null,
  );
  const [newNotebookName, setNewNotebookName] = useState("");
  const [renamingNotebookName, setRenamingNotebookName] = useState("");

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
    onError: toastErrorHandler(
      "Couldn't create notebook",
      "create-notebook-error",
    ),
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
    onError: toastErrorHandler(
      "Couldn't rename notebook",
      "rename-notebook-error",
    ),
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
    onError: toastErrorHandler(
      "Couldn't delete notebook",
      "delete-notebook-error",
    ),
  });

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

  const showCreateNotebook = () => {
    setEditingNotebookId(null);
    setRenamingNotebookName("");
    setIsCreatingNotebook(true);
  };

  const hideCreateNotebook = () => {
    setIsCreatingNotebook(false);
    setNewNotebookName("");
  };

  const showRenameNotebook = (
    notebookId: string,
    notebooks: NotebookSummary[],
  ) => {
    const nb = notebooks.find((item) => item.id === notebookId);
    if (!nb) {
      return;
    }

    setIsCreatingNotebook(false);
    setNewNotebookName("");
    setEditingNotebookId(notebookId);
    setRenamingNotebookName(nb.name);
  };

  const hideRenameNotebook = () => {
    setEditingNotebookId(null);
    setRenamingNotebookName("");
  };

  return {
    isCreatingNotebook,
    editingNotebookId,
    newNotebookName,
    setNewNotebookName,
    renamingNotebookName,
    setRenamingNotebookName,
    renameNotebookMutation,
    deleteNotebookMutation,
    submitNotebook,
    submitRenameNotebook,
    handleDeleteNotebook,
    showCreateNotebook,
    hideCreateNotebook,
    showRenameNotebook,
    hideRenameNotebook,
  };
}
