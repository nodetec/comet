export const FOCUS_NOTE_EVENT = "comet:focus-note";

export type FocusNoteDetail = {
  noteId: string;
};

export function dispatchFocusNote(noteId: string) {
  window.dispatchEvent(
    new CustomEvent<FocusNoteDetail>(FOCUS_NOTE_EVENT, {
      detail: { noteId },
    }),
  );
}
