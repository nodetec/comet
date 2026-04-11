import {
  type CreateNoteFromWikilinkDetail,
  useShellCommandStore,
} from "@/features/shell/store/use-shell-command-store";

export type { CreateNoteFromWikilinkDetail };

export function dispatchFocusNote(noteId: string) {
  useShellCommandStore.getState().actions.requestFocusNote(noteId);
}

export function dispatchCreateNoteFromWikilink(
  detail: CreateNoteFromWikilinkDetail,
) {
  useShellCommandStore.getState().actions.requestCreateNoteFromWikilink(detail);
}
