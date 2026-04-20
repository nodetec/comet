import { type DraftState, useDraftStore } from "./use-draft-store";
import {
  type NavigationState,
  useNavigationStore,
} from "./use-navigation-store";

export type { NoteFilter } from "./use-navigation-store";
export type { FocusedPane } from "./use-navigation-store";

type AppActions = NavigationState["actions"] & DraftState["actions"];
type AppState = Omit<NavigationState, "actions"> &
  Omit<DraftState, "actions"> & {
    actions: AppActions;
  };

const navigationActions = useNavigationStore.getState().actions;
const draftActions = useDraftStore.getState().actions;
const appActions: AppActions = {
  ...navigationActions,
  ...draftActions,
};

function getAppState(): AppState {
  const { actions: _navActions, ...navigationState } =
    useNavigationStore.getState();
  const { actions: _draftActions, ...draftState } = useDraftStore.getState();

  return {
    ...navigationState,
    ...draftState,
    actions: appActions,
  };
}

function setAppState(partial: Partial<AppState>) {
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
    useNavigationStore.setState(navigationState);
  }
  if (Object.keys(draftState).length > 0) {
    useDraftStore.setState(draftState);
  }
}

function subscribeAppState(listener: (state: AppState) => void) {
  const emit = () => listener(getAppState());
  const unsubscribeNavigation = useNavigationStore.subscribe(emit);
  const unsubscribeDraft = useDraftStore.subscribe(emit);

  return () => {
    unsubscribeNavigation();
    unsubscribeDraft();
  };
}

export const appStore = {
  getState: getAppState,
  setState: setAppState,
  subscribe: subscribeAppState,
};

export const useActiveTagPath = () =>
  useNavigationStore((s) => s.activeTagPath);
export const useCreatingSelectedNoteId = () =>
  useNavigationStore((s) => s.creatingSelectedNoteId);
export const useDraftMarkdown = () => useDraftStore((s) => s.draftMarkdown);
export const useDraftNoteId = () => useDraftStore((s) => s.draftNoteId);
export const useDraftWikilinkResolutions = () =>
  useDraftStore((s) => s.draftWikilinkResolutions);
export const useFocusedPane = () => useNavigationStore((s) => s.focusedPane);
export const useIsCreatingNoteTransition = () =>
  useNavigationStore((s) => s.isCreatingNoteTransition);
export const useNoteFilter = () => useNavigationStore((s) => s.noteFilter);
export const usePendingAutoFocusEditorNoteId = () =>
  useNavigationStore((s) => s.pendingAutoFocusEditorNoteId);
export const useSearchQuery = () => useNavigationStore((s) => s.searchQuery);
export const useSelectedNoteId = () =>
  useNavigationStore((s) => s.selectedNoteId);
export const useTagViewActive = () =>
  useNavigationStore((s) => s.tagViewActive);
