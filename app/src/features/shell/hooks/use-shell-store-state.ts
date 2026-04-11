import {
  useActiveTagPath,
  useCreatingSelectedNoteId,
  useDraftMarkdown,
  useDraftNoteId,
  useDraftWikilinkResolutions,
  useIsCreatingNoteTransition,
  useNoteFilter,
  usePendingAutoFocusEditorNoteId,
  useSearchQuery,
  useSelectedNoteId,
  useTagViewActive,
} from "@/features/shell/store/use-shell-store";
import { useShellDraftStore } from "@/features/shell/store/use-shell-draft-store";
import { useShellNavigationStore } from "@/features/shell/store/use-shell-navigation-store";
import {
  defaultNoteSortPrefs,
  useNoteSortPrefs,
} from "@/features/settings/store/use-ui-store";

export function useShellStoreState() {
  const activeTagPath = useActiveTagPath();
  const creatingSelectedNoteId = useCreatingSelectedNoteId();
  const draftMarkdown = useDraftMarkdown();
  const draftNoteId = useDraftNoteId();
  const draftWikilinkResolutions = useDraftWikilinkResolutions();
  const isCreatingNoteTransition = useIsCreatingNoteTransition();
  const noteFilter = useNoteFilter();
  const pendingAutoFocusEditorNoteId = usePendingAutoFocusEditorNoteId();
  const searchQuery = useSearchQuery();
  const selectedNoteId = useSelectedNoteId();
  const tagViewActive = useTagViewActive();
  const navigationActions = useShellNavigationStore((state) => state.actions);
  const draftActions = useShellDraftStore((state) => state.actions);

  const effectiveNoteFilter = tagViewActive ? "all" : noteFilter;
  const allSortPrefs = useNoteSortPrefs();
  const sortPrefs = allSortPrefs[effectiveNoteFilter] ?? defaultNoteSortPrefs;

  return {
    activeTagPath,
    creatingSelectedNoteId,
    draftMarkdown,
    draftNoteId,
    draftWikilinkResolutions,
    isCreatingNoteTransition,
    noteFilter,
    pendingAutoFocusEditorNoteId,
    searchQuery,
    selectedNoteId,
    tagViewActive,
    effectiveNoteFilter,
    sortPrefs,
    ...navigationActions,
    ...draftActions,
  };
}
