import {
  type FocusEditorDetail,
  type FocusNotesPaneDetail,
  useShellCommandStore,
} from "@/shared/stores/use-shell-command-store";

export type { FocusEditorDetail, FocusNotesPaneDetail };

export function dispatchFocusNotesPane(detail?: FocusNotesPaneDetail) {
  useShellCommandStore.getState().actions.requestFocusNotesPane(detail);
}

export function dispatchFocusEditor(detail?: FocusEditorDetail) {
  useShellCommandStore.getState().actions.requestFocusEditor(detail);
}
