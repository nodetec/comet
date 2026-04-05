import { type RefObject, useEffect, useRef } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";

import { getNoteConflict, loadNote } from "@/shared/api/invoke";
import { useShellStore } from "@/features/shell/store/use-shell-store";

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
  const { draftMarkdown: currentDraft } = useShellStore.getState();

  if (freshNote.markdown !== currentDraft) {
    useShellStore.getState().setDraft("", "");
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
    deletedIds: Set<string>;
    upsertedIds: Set<string>;
  }>({
    deletedIds: new Set(),
    upsertedIds: new Set(),
  });
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const flushPendingBatch = () => {
      flushTimerRef.current = null;

      const deletedIds = new Set(pendingBatchRef.current.deletedIds);
      const upsertedIds = new Set(pendingBatchRef.current.upsertedIds);
      pendingBatchRef.current.deletedIds.clear();
      pendingBatchRef.current.upsertedIds.clear();

      if (deletedIds.size === 0 && upsertedIds.size === 0) {
        return;
      }

      const changedIds = new Set([...deletedIds, ...upsertedIds]);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["contextual-tags"] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });

      for (const noteId of changedIds) {
        void queryClient.invalidateQueries({ queryKey: ["note", noteId] });
        void queryClient.invalidateQueries({
          queryKey: ["note-conflict", noteId],
        });
      }

      const { draftNoteId: currentDraftId, selectedNoteId: currentSelectedId } =
        useShellStore.getState();
      const currentOpenNoteId = currentDraftId ?? currentSelectedId;
      const hasPendingSave =
        Boolean(pendingSaveTimeoutRef.current) || isSavingRef.current;

      if (currentOpenNoteId && deletedIds.has(currentOpenNoteId)) {
        queryClient.removeQueries({
          exact: true,
          queryKey: ["note", currentOpenNoteId],
        });
        useShellStore.getState().setDraft("", "");
        useShellStore.getState().setSelectedNoteId(null);
        bumpSyncEditorRevision("sync-remote-delete", {
          noteId: currentOpenNoteId,
        });
        return;
      }

      if (currentDraftId && upsertedIds.has(currentDraftId)) {
        void Promise.all([
          queryClient.fetchQuery({
            queryKey: ["note", currentDraftId],
            queryFn: () => loadNote(currentDraftId),
          }),
          getNoteConflict(currentDraftId).catch(() => null),
        ])
          .then(([freshNote, conflict]) => {
            if (conflict && conflict.snapshotCount > 1) {
              if (pendingSaveTimeoutRef.current !== null) {
                window.clearTimeout(pendingSaveTimeoutRef.current);
                pendingSaveTimeoutRef.current = null;
              }
              handleFreshNote(freshNote, queryClient, bumpSyncEditorRevision);
              return;
            }

            if (!hasPendingSave) {
              handleFreshNote(freshNote, queryClient, bumpSyncEditorRevision);
            }
          })
          .catch(() => {});
      }
    };

    const unlisten = listen<{ noteId: string; action: string }>(
      "sync-remote-change",
      (event) => {
        const { noteId, action } = event.payload;
        if (action === "delete") {
          pendingBatchRef.current.deletedIds.add(noteId);
          pendingBatchRef.current.upsertedIds.delete(noteId);
        } else if (action === "upsert" || action === "conflict") {
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
}
