import { type DraftState, useShellDraftStore } from "./use-shell-draft-store";
import {
  type NavigationState,
  useShellNavigationStore,
} from "./use-shell-navigation-store";

export type { NoteFilter } from "./use-shell-navigation-store";
export type { FocusedPane } from "./use-shell-navigation-store";

type ShellActions = NavigationState["actions"] & DraftState["actions"];
type ShellState = Omit<NavigationState, "actions"> &
  Omit<DraftState, "actions"> & {
    actions: ShellActions;
  };

const navigationActions = useShellNavigationStore.getState().actions;
const draftActions = useShellDraftStore.getState().actions;
const shellActions: ShellActions = {
  ...navigationActions,
  ...draftActions,
};

function getShellState(): ShellState {
  const { actions: _navActions, ...navigationState } =
    useShellNavigationStore.getState();
  const { actions: _draftActions, ...draftState } =
    useShellDraftStore.getState();

  return {
    ...navigationState,
    ...draftState,
    actions: shellActions,
  };
}

function setShellState(partial: Partial<ShellState>) {
  const navigationState: Partial<Omit<NavigationState, "actions">> = {};
  const draftState: Partial<Omit<DraftState, "actions">> = {};

  if ("activeTagPath" in partial) {
    navigationState.activeTagPath = partial.activeTagPath ?? null;
  }
  if ("creatingSelectedNoteId" in partial) {
    navigationState.creatingSelectedNoteId =
      partial.creatingSelectedNoteId ?? null;
  }
  if ("focusedPane" in partial && partial.focusedPane !== undefined) {
    navigationState.focusedPane = partial.focusedPane;
  }
  if ("isCreatingNoteTransition" in partial) {
    navigationState.isCreatingNoteTransition =
      partial.isCreatingNoteTransition ?? false;
  }
  if ("noteFilter" in partial && partial.noteFilter !== undefined) {
    navigationState.noteFilter = partial.noteFilter;
  }
  if ("pendingAutoFocusEditorNoteId" in partial) {
    navigationState.pendingAutoFocusEditorNoteId =
      partial.pendingAutoFocusEditorNoteId ?? null;
  }
  if ("searchQuery" in partial) {
    navigationState.searchQuery = partial.searchQuery ?? "";
  }
  if ("selectedNoteId" in partial) {
    navigationState.selectedNoteId = partial.selectedNoteId ?? null;
  }
  if ("tagViewActive" in partial) {
    navigationState.tagViewActive = partial.tagViewActive ?? false;
  }

  if ("draftMarkdown" in partial) {
    draftState.draftMarkdown = partial.draftMarkdown ?? "";
  }
  if ("draftNoteId" in partial) {
    draftState.draftNoteId = partial.draftNoteId ?? null;
  }
  if ("draftWikilinkResolutions" in partial) {
    draftState.draftWikilinkResolutions =
      partial.draftWikilinkResolutions ?? [];
  }

  if (Object.keys(navigationState).length > 0) {
    useShellNavigationStore.setState(navigationState);
  }
  if (Object.keys(draftState).length > 0) {
    useShellDraftStore.setState(draftState);
  }
}

function subscribeShellState(listener: (state: ShellState) => void) {
  const emit = () => listener(getShellState());
  const unsubscribeNavigation = useShellNavigationStore.subscribe(emit);
  const unsubscribeDraft = useShellDraftStore.subscribe(emit);

  return () => {
    unsubscribeNavigation();
    unsubscribeDraft();
  };
}

export const shellStore = {
  getState: getShellState,
  setState: setShellState,
  subscribe: subscribeShellState,
};

export const useActiveTagPath = () =>
  useShellNavigationStore((s) => s.activeTagPath);
export const useCreatingSelectedNoteId = () =>
  useShellNavigationStore((s) => s.creatingSelectedNoteId);
export const useDraftMarkdown = () =>
  useShellDraftStore((s) => s.draftMarkdown);
export const useDraftNoteId = () => useShellDraftStore((s) => s.draftNoteId);
export const useDraftWikilinkResolutions = () =>
  useShellDraftStore((s) => s.draftWikilinkResolutions);
export const useFocusedPane = () =>
  useShellNavigationStore((s) => s.focusedPane);
export const useIsCreatingNoteTransition = () =>
  useShellNavigationStore((s) => s.isCreatingNoteTransition);
export const useNoteFilter = () => useShellNavigationStore((s) => s.noteFilter);
export const usePendingAutoFocusEditorNoteId = () =>
  useShellNavigationStore((s) => s.pendingAutoFocusEditorNoteId);
export const useSearchQuery = () =>
  useShellNavigationStore((s) => s.searchQuery);
export const useSelectedNoteId = () =>
  useShellNavigationStore((s) => s.selectedNoteId);
export const useTagViewActive = () =>
  useShellNavigationStore((s) => s.tagViewActive);
