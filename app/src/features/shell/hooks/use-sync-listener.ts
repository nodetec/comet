import { type RefObject, useEffect, useRef } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { getNoteConflict, loadNote } from "@/shared/api/invoke";
import { useShellDraftStore } from "@/features/shell/store/use-shell-draft-store";
import { useShellNavigationStore } from "@/features/shell/store/use-shell-navigation-store";

export interface SyncListenerDeps {
  queryClient: QueryClient;
  pendingSaveTimeoutRef: RefObject<number | null>;
  isSavingRef: RefObject<boolean>;
  bumpSyncEditorRevision: (
    reason: string,
    details?: Record<string, unknown>,
  ) => void;
}

function handleFreshNote(
  freshNote: { id: string; markdown: string } | undefined,
  queryClient: SyncListenerDeps["queryClient"],
  bumpSyncEditorRevision: SyncListenerDeps["bumpSyncEditorRevision"],
) {
  if (!freshNote) return;
  queryClient.setQueryData(["note", freshNote.id], freshNote);
  const { draftMarkdown: currentDraft } = useShellDraftStore.getState();

  if (freshNote.markdown !== currentDraft) {
    useShellDraftStore.getState().actions.setDraft("", "");
    bumpSyncEditorRevision("sync-remote-upsert", {
      draftLength: currentDraft.length,
      freshLength: freshNote.markdown.length,
      noteId: freshNote.id,
    });
  }
}

export function useSyncListener(deps: SyncListenerDeps) {
  const {
    queryClient,
    pendingSaveTimeoutRef,
    isSavingRef,
    bumpSyncEditorRevision,
  } = deps;
  const pendingBatchRef = useRef<{
    bootstrapApplied: boolean;
    deletedIds: Set<string>;
    upsertedIds: Set<string>;
  }>({
    bootstrapApplied: false,
    deletedIds: new Set(),
    upsertedIds: new Set(),
  });
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const refreshCurrentOpenNote = (
      currentOpenNoteId: string,
      currentDraftId: string | null,
      hasPendingSave: boolean,
      reason: string,
    ) => {
      void queryClient.invalidateQueries({
        queryKey: ["note", currentOpenNoteId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["note-conflict", currentOpenNoteId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["note-history", currentOpenNoteId],
      });

      void Promise.all([
        queryClient.fetchQuery({
          queryKey: ["note", currentOpenNoteId],
          queryFn: () => loadNote(currentOpenNoteId),
        }),
        getNoteConflict(currentOpenNoteId).catch(() => null),
      ])
        .then(([freshNote, conflict]) => {
          if (!freshNote) {
            queryClient.removeQueries({
              exact: true,
              queryKey: ["note", currentOpenNoteId],
            });
            useShellDraftStore.getState().actions.setDraft("", "");
            useShellNavigationStore.getState().actions.setSelectedNoteId(null);
            bumpSyncEditorRevision(reason, {
              noteId: currentOpenNoteId,
            });
            return;
          }

          if (conflict && conflict.snapshotCount > 1) {
            if (pendingSaveTimeoutRef.current !== null) {
              window.clearTimeout(pendingSaveTimeoutRef.current);
              pendingSaveTimeoutRef.current = null;
            }
            handleFreshNote(freshNote, queryClient, bumpSyncEditorRevision);
            return;
          }

          if (!hasPendingSave || currentDraftId !== currentOpenNoteId) {
            handleFreshNote(freshNote, queryClient, bumpSyncEditorRevision);
          }
        })
        .catch(() => {});
    };

    const flushPendingBatch = () => {
      flushTimerRef.current = null;

      const bootstrapApplied = pendingBatchRef.current.bootstrapApplied;
      const deletedIds = new Set(pendingBatchRef.current.deletedIds);
      const upsertedIds = new Set(pendingBatchRef.current.upsertedIds);
      pendingBatchRef.current.bootstrapApplied = false;
      pendingBatchRef.current.deletedIds.clear();
      pendingBatchRef.current.upsertedIds.clear();

      if (
        !bootstrapApplied &&
        deletedIds.size === 0 &&
        upsertedIds.size === 0
      ) {
        return;
      }

      const changedIds = new Set([...deletedIds, ...upsertedIds]);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["contextual-tags"] });
      void queryClient.invalidateQueries({ queryKey: ["note-backlinks"] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });

      if (!bootstrapApplied) {
        for (const noteId of changedIds) {
          void queryClient.invalidateQueries({ queryKey: ["note", noteId] });
          void queryClient.invalidateQueries({
            queryKey: ["note-conflict", noteId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["note-history", noteId],
          });
        }
      }

      const { draftNoteId: currentDraftId } = useShellDraftStore.getState();
      const { selectedNoteId: currentSelectedId } =
        useShellNavigationStore.getState();
      const currentOpenNoteId = currentDraftId ?? currentSelectedId;
      const hasPendingSave =
        Boolean(pendingSaveTimeoutRef.current) || isSavingRef.current;

      if (currentOpenNoteId && deletedIds.has(currentOpenNoteId)) {
        queryClient.removeQueries({
          exact: true,
          queryKey: ["note", currentOpenNoteId],
        });
        useShellDraftStore.getState().actions.setDraft("", "");
        useShellNavigationStore.getState().actions.setSelectedNoteId(null);
        bumpSyncEditorRevision("sync-remote-delete", {
          noteId: currentOpenNoteId,
        });
        return;
      }

      if (bootstrapApplied && currentOpenNoteId) {
        refreshCurrentOpenNote(
          currentOpenNoteId,
          currentDraftId,
          hasPendingSave,
          "sync-remote-bootstrap-delete",
        );
        return;
      }

      if (currentDraftId && upsertedIds.has(currentDraftId)) {
        refreshCurrentOpenNote(
          currentDraftId,
          currentDraftId,
          hasPendingSave,
          "sync-remote-delete",
        );
      }
    };

    const unlisten = listen<{ noteId?: string; action: string }>(
      "sync-remote-change",
      (event) => {
        const { noteId, action } = event.payload;
        if (action === "bootstrap") {
          pendingBatchRef.current.bootstrapApplied = true;
          pendingBatchRef.current.deletedIds.clear();
          pendingBatchRef.current.upsertedIds.clear();
        } else if (
          action === "delete" &&
          typeof noteId === "string" &&
          noteId.length > 0
        ) {
          pendingBatchRef.current.deletedIds.add(noteId);
          pendingBatchRef.current.upsertedIds.delete(noteId);
        } else if (
          (action === "upsert" || action === "conflict") &&
          typeof noteId === "string" &&
          noteId.length > 0
        ) {
          pendingBatchRef.current.upsertedIds.add(noteId);
        }

        if (flushTimerRef.current === null) {
          flushTimerRef.current = window.setTimeout(flushPendingBatch, 100);
        }
      },
    );
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      void unlisten.then((fn) => fn());
    };
  }, [queryClient, pendingSaveTimeoutRef, isSavingRef, bumpSyncEditorRevision]);

  // Restart sync when the app becomes visible again (e.g. laptop wake).
  // The WebSocket connection likely died during sleep, but the sync loop
  // is still blocked waiting on the dead socket.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void invoke("restart_sync").catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
