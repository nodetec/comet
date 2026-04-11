import { useRef } from "react";

import type {
  LoadedNote,
  NoteBacklink,
  NoteConflictInfo,
} from "@/shared/api/types";

export interface EditorPaneModelDeps {
  availableTagPaths: string[];
  currentEditorMarkdown: string;
  currentNote: LoadedNote | undefined;
  currentNoteConflict: NoteConflictInfo | null | undefined;
  displayedSelectedNoteId: string | null;
  isCreatingNote: boolean;
  isDeletePublishedNotePending: boolean;
  isPublishNotePending: boolean;
  isPublishShortNotePending: boolean;
  isResolveConflictPending: boolean;
  noteBacklinks: NoteBacklink[] | undefined;
  noteQueryIsPlaceholderData: boolean;
  pendingAutoFocusEditorNoteId: string | null;
  searchQuery: string;
  selectedConflictSnapshotId: string | null;
  setChooseConflictDialogOpen: (open: boolean) => void;
  setChooseConflictNoteId: (noteId: string | null) => void;
  setDeletePublishDialogOpen: (open: boolean) => void;
  setDraft: (
    noteId: string,
    markdown: string,
    options?: {
      preserveWikilinkResolutions?: boolean;
      wikilinkResolutions?: LoadedNote["wikilinkResolutions"];
    },
  ) => void;
  setPendingAutoFocusEditorNoteId: (noteId: string | null) => void;
  setPublishDialogOpen: (open: boolean) => void;
  setPublishShortNoteDialogOpen: (open: boolean) => void;
  syncEditorRevision: number;
  flushCurrentDraftAsync: () => Promise<unknown>;
  handleDuplicateNote: (noteId: string) => void;
  handleLoadConflictHead: (snapshotId: string, markdown: string | null) => void;
  handleOpenNoteHistory: () => void;
  handleSelectNote: (noteId: string) => void;
  handleSetNotePinned: (noteId: string, pinned: boolean) => void;
  handleSetNoteReadonly: (noteId: string, readonly: boolean) => void;
}

export function useEditorPaneModel(deps: EditorPaneModelDeps) {
  const currentNoteId = deps.currentNote?.id ?? null;

  const nextEditorPaneProps = {
    availableTagPaths: deps.availableTagPaths,
    archivedAt: deps.currentNote?.archivedAt ?? null,
    autoFocusEditor: currentNoteId === deps.pendingAutoFocusEditorNoteId,
    backlinks: deps.noteBacklinks ?? [],
    deletedAt: deps.currentNote?.deletedAt ?? null,
    markdown: deps.currentEditorMarkdown,
    modifiedAt: deps.currentNote?.modifiedAt ?? 0,
    noteConflict: deps.currentNoteConflict ?? null,
    noteId:
      deps.displayedSelectedNoteId || deps.isCreatingNote
        ? (deps.currentNote?.id ?? null)
        : null,
    editorKey: deps.currentNote
      ? `${deps.currentNote.id}-${deps.syncEditorRevision}`
      : null,
    pinnedAt: deps.currentNote?.pinnedAt ?? null,
    publishedAt: deps.currentNote?.publishedAt ?? null,
    publishedKind: deps.currentNote?.publishedKind ?? null,
    readonly: deps.currentNote?.readonly ?? false,
    selectedConflictSnapshotId: deps.selectedConflictSnapshotId,
    searchQuery: deps.searchQuery,
    isDeletePublishedNotePending: deps.isDeletePublishedNotePending,
    isResolveConflictPending: deps.isResolveConflictPending,
    onDeletePublishedNote() {
      if (
        !deps.currentNote ||
        deps.isDeletePublishedNotePending ||
        !deps.currentNote.publishedAt
      ) {
        return;
      }

      deps.setDeletePublishDialogOpen(true);
    },
    onDuplicateNote() {
      if (deps.currentNote) {
        deps.handleDuplicateNote(deps.currentNote.id);
      }
    },
    onAutoFocusEditorHandled() {
      if (currentNoteId === deps.pendingAutoFocusEditorNoteId) {
        deps.setPendingAutoFocusEditorNoteId(null);
      }
    },
    onOpenPublishDialog() {
      if (!deps.currentNote || deps.isPublishNotePending) {
        return;
      }

      void (async () => {
        await deps.flushCurrentDraftAsync();
        deps.setPublishDialogOpen(true);
      })().catch(() => {});
    },
    onPublishShortNote() {
      if (!deps.currentNote || deps.isPublishShortNotePending) {
        return;
      }

      void (async () => {
        await deps.flushCurrentDraftAsync();
        deps.setPublishShortNoteDialogOpen(true);
      })().catch(() => {});
    },
    onSetPinned(pinned: boolean) {
      if (deps.currentNote) {
        deps.handleSetNotePinned(deps.currentNote.id, pinned);
      }
    },
    onSetReadonly(readonly: boolean) {
      if (deps.currentNote) {
        deps.handleSetNoteReadonly(deps.currentNote.id, readonly);
      }
    },
    onChange(markdown: string) {
      if (
        deps.currentNote &&
        !deps.currentNote.archivedAt &&
        !deps.currentNote.readonly
      ) {
        deps.setDraft(deps.currentNote.id, markdown, {
          preserveWikilinkResolutions: true,
        });
      }
    },
    onLoadConflictHead(snapshotId: string, markdown: string | null) {
      deps.handleLoadConflictHead(snapshotId, markdown);
    },
    onSelectLinkedNote(noteId: string) {
      deps.handleSelectNote(noteId);
    },
    onResolveConflict() {
      deps.setChooseConflictNoteId(deps.currentNote?.id ?? null);
      deps.setChooseConflictDialogOpen(true);
    },
    onOpenHistory() {
      deps.handleOpenNoteHistory();
    },
  };

  const holdPreviousEditorPane =
    deps.noteQueryIsPlaceholderData && deps.currentNote !== undefined;
  const editorPanePropsRef = useRef(nextEditorPaneProps);
  if (!holdPreviousEditorPane) {
    editorPanePropsRef.current = nextEditorPaneProps;
  }

  return holdPreviousEditorPane
    ? editorPanePropsRef.current
    : nextEditorPaneProps;
}
