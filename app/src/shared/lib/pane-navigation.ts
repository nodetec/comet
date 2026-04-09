export const FOCUS_NOTES_PANE_EVENT = "comet:focus-notes-pane";
export const FOCUS_EDITOR_EVENT = "comet:focus-editor";

export type FocusNotesPaneDetail = {
  selection?: "first" | "selected";
};

export type FocusEditorDetail = {
  scrollTo?: "preserve" | "top";
};

export function dispatchFocusNotesPane(detail?: FocusNotesPaneDetail) {
  window.dispatchEvent(
    new CustomEvent<FocusNotesPaneDetail>(FOCUS_NOTES_PANE_EVENT, {
      detail,
    }),
  );
}

export function dispatchFocusEditor(detail?: FocusEditorDetail) {
  window.dispatchEvent(
    new CustomEvent<FocusEditorDetail>(FOCUS_EDITOR_EVENT, {
      detail,
    }),
  );
}
