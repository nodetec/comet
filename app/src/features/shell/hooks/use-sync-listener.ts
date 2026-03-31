import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
} from "react";
import { type QueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";

import { getNoteConflict, loadNote } from "@/shared/api/invoke";
import { useShellStore } from "@/features/shell/store/use-shell-store";

export interface SyncListenerDeps {
  queryClient: QueryClient;
  pendingSaveTimeoutRef: RefObject<number | null>;
  isSavingRef: RefObject<boolean>;
  setSyncEditorRevision: Dispatch<SetStateAction<number>>;
}

function handleFreshNote(
  freshNote: { id: string; markdown: string } | undefined,
  queryClient: SyncListenerDeps["queryClient"],
  setSyncEditorRevision: SyncListenerDeps["setSyncEditorRevision"],
) {
  if (!freshNote) return;
  queryClient.setQueryData(["note", freshNote.id], freshNote);
  const { draftMarkdown: currentDraft } = useShellStore.getState();
  if (freshNote.markdown !== currentDraft) {
    useShellStore.getState().setDraft("", "");
    setSyncEditorRevision((r) => r + 1);
  }
}

export function useSyncListener(deps: SyncListenerDeps) {
  const {
    queryClient,
    pendingSaveTimeoutRef,
    isSavingRef,
    setSyncEditorRevision,
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
        setSyncEditorRevision((r) => r + 1);
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
            if (conflict && conflict.headCount > 1) {
              if (pendingSaveTimeoutRef.current !== null) {
                window.clearTimeout(pendingSaveTimeoutRef.current);
                pendingSaveTimeoutRef.current = null;
              }
              handleFreshNote(freshNote, queryClient, setSyncEditorRevision);
              return;
            }

            if (!hasPendingSave) {
              handleFreshNote(freshNote, queryClient, setSyncEditorRevision);
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
        } else if (action === "upsert") {
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
  }, [queryClient, pendingSaveTimeoutRef, isSavingRef, setSyncEditorRevision]);
}
