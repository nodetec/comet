export const FOCUS_NOTE_EVENT = "comet:focus-note";
export const CREATE_NOTE_FROM_WIKILINK_EVENT =
  "comet:create-note-from-wikilink";

export type FocusNoteDetail = {
  noteId: string;
};

export type CreateNoteFromWikilinkDetail = {
  location: number;
  sourceNoteId: string;
  title: string;
};

export function dispatchFocusNote(noteId: string) {
  window.dispatchEvent(
    new CustomEvent<FocusNoteDetail>(FOCUS_NOTE_EVENT, {
      detail: { noteId },
    }),
  );
}

export function dispatchCreateNoteFromWikilink(
  detail: CreateNoteFromWikilinkDetail,
) {
  window.dispatchEvent(
    new CustomEvent<CreateNoteFromWikilinkDetail>(
      CREATE_NOTE_FROM_WIKILINK_EVENT,
      {
        detail,
      },
    ),
  );
}
