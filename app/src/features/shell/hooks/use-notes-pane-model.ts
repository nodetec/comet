import type { NoteSummary } from "@/shared/api/types";

export interface NotesPaneModelDeps {
  currentNotes: NoteSummary[];
  displayedSelectedNoteId: string | null;
  hasMoreNotes: boolean | undefined;
  isCreatingNote: boolean;
  isLoadingMoreNotes: boolean;
  isMutatingNote: boolean;
  isNotesPlaceholderData: boolean;
  totalNoteCount: number;
  handleArchiveNote: (noteId: string) => void;
  handleCopyNoteContent: (noteId: string) => void;
  handleCreateNote: () => void;
  handleDeleteNotePermanently: (noteId: string) => void;
  handleDuplicateNote: (noteId: string) => void;
  handleExportNotes: () => void;
  handleLoadMoreNotes: () => void;
  handleRestoreFromTrash: (noteId: string) => void;
  handleRestoreNote: (noteId: string) => void;
  handleSelectNote: (noteId: string) => void;
  handleSetNotePinned: (noteId: string, pinned: boolean) => void;
  handleSetNoteReadonly: (noteId: string, readonly: boolean) => void;
  handleTrashNote: (noteId: string) => void;
}

export function useNotesPaneModel(deps: NotesPaneModelDeps) {
  return {
    filteredNotes: deps.currentNotes,
    hasMoreNotes: deps.hasMoreNotes,
    isCreatingNote: deps.isCreatingNote,
    isLoadingMoreNotes: deps.isLoadingMoreNotes,
    isNotesPlaceholderData: deps.isNotesPlaceholderData,
    isMutatingNote: deps.isMutatingNote,
    selectedNoteId: deps.displayedSelectedNoteId,
    totalNoteCount: deps.totalNoteCount,
    onArchiveNote: deps.handleArchiveNote,
    onCopyNoteContent: deps.handleCopyNoteContent,
    onCreateNote: deps.handleCreateNote,
    onDeleteNotePermanently: deps.handleDeleteNotePermanently,
    onDuplicateNote: deps.handleDuplicateNote,
    onExportNotes: deps.handleExportNotes,
    onLoadMore: deps.handleLoadMoreNotes,
    onRestoreFromTrash: deps.handleRestoreFromTrash,
    onRestoreNote: deps.handleRestoreNote,
    onSelectNote: deps.handleSelectNote,
    onSetNotePinned: deps.handleSetNotePinned,
    onSetNoteReadonly: deps.handleSetNoteReadonly,
    onTrashNote: deps.handleTrashNote,
  };
}
