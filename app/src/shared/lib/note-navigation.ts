import {
  type CreateNoteFromWikilinkDetail,
  useCommandStore,
} from "@/shared/stores/use-command-store";

export type { CreateNoteFromWikilinkDetail };

export function dispatchFocusNote(noteId: string) {
  useCommandStore.getState().actions.requestFocusNote(noteId);
}

export function dispatchCreateNoteFromWikilink(
  detail: CreateNoteFromWikilinkDetail,
) {
  useCommandStore.getState().actions.requestCreateNoteFromWikilink(detail);
}
