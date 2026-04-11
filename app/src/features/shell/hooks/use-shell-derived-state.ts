import { haveSameWikilinkResolutions } from "@/shared/lib/wikilink-resolutions";
import type {
  LoadedNote,
  NoteConflictInfo,
  NoteHistoryInfo,
  WikiLinkResolutionInput,
} from "@/shared/api/types";

export interface ShellDerivedStateDeps {
  bootstrapQuery: {
    isError: boolean;
    isSuccess: boolean;
  };
  createNotePending: boolean;
  creatingSelectedNoteId: string | null;
  currentNoteQueryData: LoadedNote | undefined;
  draftMarkdown: string;
  draftNoteId: string | null;
  draftWikilinkResolutions: WikiLinkResolutionInput[];
  hasHydratedInitialSelection: boolean;
  isCreatingNoteTransition: boolean;
  noteConflictQueryData: NoteConflictInfo | null | undefined;
  noteHistoryQueryData: NoteHistoryInfo | undefined;
  selectedNoteId: string | null;
}

export function useShellDerivedState(deps: ShellDerivedStateDeps) {
  const currentNote = deps.selectedNoteId
    ? deps.currentNoteQueryData
    : undefined;
  const currentNoteId = currentNote?.id ?? null;
  const currentNoteConflict = deps.selectedNoteId
    ? deps.noteConflictQueryData
    : undefined;
  const currentNoteHistory = deps.selectedNoteId
    ? deps.noteHistoryQueryData
    : undefined;
  const isCurrentNoteConflicted = (currentNoteConflict?.snapshotCount ?? 0) > 1;
  const hasPendingWikilinkResolutionChanges = currentNote
    ? !haveSameWikilinkResolutions(
        deps.draftWikilinkResolutions,
        currentNote.wikilinkResolutions,
      )
    : deps.draftWikilinkResolutions.length > 0;
  const readyToRevealWindow =
    deps.bootstrapQuery.isError ||
    (deps.bootstrapQuery.isSuccess &&
      deps.hasHydratedInitialSelection &&
      (!deps.selectedNoteId || currentNote?.id === deps.selectedNoteId));
  const isCreatingNote =
    deps.isCreatingNoteTransition || deps.createNotePending;
  const displayedSelectedNoteId = isCreatingNote
    ? deps.creatingSelectedNoteId
    : deps.selectedNoteId;
  const currentEditorMarkdown =
    currentNote && deps.draftNoteId === currentNote.id
      ? deps.draftMarkdown
      : (currentNote?.markdown ?? "");

  return {
    currentNote,
    currentNoteId,
    currentNoteConflict,
    currentNoteHistory,
    isCurrentNoteConflicted,
    hasPendingWikilinkResolutionChanges,
    readyToRevealWindow,
    isCreatingNote,
    displayedSelectedNoteId,
    currentEditorMarkdown,
  };
}
