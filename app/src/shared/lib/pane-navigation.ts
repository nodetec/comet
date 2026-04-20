import {
  type FocusEditorDetail,
  type FocusNotesPaneDetail,
  useCommandStore,
} from "@/shared/stores/use-command-store";

export type { FocusEditorDetail, FocusNotesPaneDetail };

export function dispatchFocusNotesPane(detail?: FocusNotesPaneDetail) {
  useCommandStore.getState().actions.requestFocusNotesPane(detail);
}

export function dispatchFocusEditor(detail?: FocusEditorDetail) {
  useCommandStore.getState().actions.requestFocusEditor(detail);
}
