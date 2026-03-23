import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { toastErrorHandler } from "@/shared/lib/mutation-utils";

import { deletePublishedNote, publishNote, publishShortNote } from "@/shared/api/invoke";

export function usePublishState() {
  const queryClient = useQueryClient();
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishShortNoteDialogOpen, setPublishShortNoteDialogOpen] =
    useState(false);
  const [deletePublishDialogOpen, setDeletePublishDialogOpen] = useState(false);

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
    onError: toastErrorHandler("Couldn't publish note", "publish-note-error"),
  });

  const publishShortNoteMutation = useMutation({
    mutationFn: publishShortNote,
    onSuccess: (result, input) => {
      setPublishShortNoteDialogOpen(false);
      toast.success(
        `Published to ${result.successCount} of ${result.relayCount} relay${result.relayCount === 1 ? "" : "s"}`,
        { id: "publish-short-note-success" },
      );
      void queryClient.invalidateQueries({ queryKey: ["note", input.noteId] });
    },
    onError: toastErrorHandler(
      "Couldn't publish note",
      "publish-short-note-error",
    ),
  });

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
    onError: toastErrorHandler(
      "Couldn't delete published note",
      "delete-published-note-error",
    ),
  });

  return {
    publishDialogOpen,
    setPublishDialogOpen,
    publishShortNoteDialogOpen,
    setPublishShortNoteDialogOpen,
    deletePublishDialogOpen,
    setDeletePublishDialogOpen,
    publishNoteMutation,
    publishShortNoteMutation,
    deletePublishedNoteMutation,
  };
}
