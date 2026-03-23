import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";

import { loadNote } from "@/shared/api/invoke";
import { useShellStore } from "@/features/shell/store/use-shell-store";

export interface SyncListenerDeps {
  queryClient: QueryClient;
  pendingSaveTimeoutRef: MutableRefObject<number | null>;
  isSavingRef: MutableRefObject<boolean>;
  setSyncEditorRevision: Dispatch<SetStateAction<number>>;
}

export function useSyncListener(deps: SyncListenerDeps) {
  const { queryClient, pendingSaveTimeoutRef, isSavingRef, setSyncEditorRevision } = deps;

  useEffect(() => {
    const unlisten = listen<{ noteId: string; action: string }>(
      "sync-remote-change",
      (event) => {
        const { noteId, action } = event.payload;
        void queryClient.invalidateQueries({ queryKey: ["notes"] });
        void queryClient.invalidateQueries({ queryKey: ["note", noteId] });
        void queryClient.invalidateQueries({ queryKey: ["contextual-tags"] });
        void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
        // If the updated note is currently open, refetch then remount editor
        // -- but only if the user isn't actively editing (unsaved draft)
        const { draftNoteId: currentDraftId } = useShellStore.getState();
        const hasPendingSave =
          Boolean(pendingSaveTimeoutRef.current) || isSavingRef.current;

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
          void queryClient
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
            })
            .catch(() => {});
        }
      },
    );
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [queryClient, pendingSaveTimeoutRef, isSavingRef, setSyncEditorRevision]);
}
