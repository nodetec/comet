import {
  type CreateNoteFromWikilinkDetail,
  useShellCommandStore,
} from "@/shared/stores/use-shell-command-store";

export type { CreateNoteFromWikilinkDetail };

export function dispatchFocusNote(noteId: string) {
  useShellCommandStore.getState().actions.requestFocusNote(noteId);
}

export function dispatchCreateNoteFromWikilink(
  detail: CreateNoteFromWikilinkDetail,
) {
  useShellCommandStore.getState().actions.requestCreateNoteFromWikilink(detail);
}
