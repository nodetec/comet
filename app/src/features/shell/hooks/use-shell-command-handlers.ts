import { useEffect, useEffectEvent, useRef } from "react";

import { canonicalizeTagPath } from "@/features/editor/lib/tags";
import { useShellCommandStore } from "@/features/shell/store/use-shell-command-store";
import type { NoteFilter } from "@/shared/api/types";
import { useShellNavigationStore } from "@/features/shell/store/use-shell-navigation-store";

export interface ShellCommandHandlerDeps {
  activeTagPath: string | null;
  tagViewActive: boolean;
  noteFilter: NoteFilter;
  isCreatingNote: boolean;
  createNoteMutation: {
    mutate: (input: {
      tags: string[];
      markdown: string;
      autoFocusEditor?: boolean;
    }) => void;
  };
  flushCurrentDraft: () => void;
  handleSelectTagPath: (tagPath: string) => void;
  handleSelectNote: (noteId: string) => void;
}

export function useShellCommandHandlers(deps: ShellCommandHandlerDeps) {
  const {
    activeTagPath,
    tagViewActive,
    noteFilter,
    isCreatingNote,
    createNoteMutation,
    flushCurrentDraft,
    handleSelectTagPath,
    handleSelectNote,
  } = deps;

  const { setNoteFilter, setFocusedPane, prepareNoteCreation } =
    useShellNavigationStore((state) => state.actions);
  const createNoteFromWikilinkRequest = useShellCommandStore(
    (state) => state.createNoteFromWikilinkRequest,
  );
  const focusNoteRequest = useShellCommandStore(
    (state) => state.focusNoteRequest,
  );
  const focusTagPathRequest = useShellCommandStore(
    (state) => state.focusTagPathRequest,
  );
  const lastHandledCreateNoteFromWikilinkRequestIdRef = useRef(0);
  const lastHandledFocusNoteRequestIdRef = useRef(0);
  const lastHandledFocusTagPathRequestIdRef = useRef(0);

  const handleFocusTagPath = useEffectEvent((requestedTagPath: string) => {
    const tagPath = canonicalizeTagPath(requestedTagPath);
    if (!tagPath) {
      return;
    }

    setFocusedPane("notes");
    handleSelectTagPath(tagPath);
  });

  const handleFocusNote = useEffectEvent((requestedNoteId: string) => {
    const noteId = requestedNoteId.trim();
    if (!noteId) {
      return;
    }

    setFocusedPane("notes");
    handleSelectNote(noteId);
  });

  const handleCreateNoteFromWikilink = useEffectEvent(
    (request: { location: number; sourceNoteId: string; title: string }) => {
      const title = request.title.trim();
      if (!title || isCreatingNote) {
        return;
      }

      flushCurrentDraft();
      const tagsForNewNote =
        tagViewActive && activeTagPath ? [activeTagPath] : [];
      if (
        !tagViewActive &&
        noteFilter !== "today" &&
        noteFilter !== "todo" &&
        noteFilter !== "pinned" &&
        noteFilter !== "untagged"
      ) {
        setNoteFilter("all");
      }
      setFocusedPane("notes");
      prepareNoteCreation();
      createNoteMutation.mutate({
        autoFocusEditor: false,
        tags: tagsForNewNote,
        markdown: `# ${title}`,
      });
    },
  );

  useEffect(() => {
    if (
      !focusTagPathRequest ||
      lastHandledFocusTagPathRequestIdRef.current ===
        focusTagPathRequest.requestId
    ) {
      return;
    }

    lastHandledFocusTagPathRequestIdRef.current = focusTagPathRequest.requestId;
    handleFocusTagPath(focusTagPathRequest.tagPath);
  }, [focusTagPathRequest, handleFocusTagPath]);

  useEffect(() => {
    if (
      !focusNoteRequest ||
      lastHandledFocusNoteRequestIdRef.current === focusNoteRequest.requestId
    ) {
      return;
    }

    lastHandledFocusNoteRequestIdRef.current = focusNoteRequest.requestId;
    handleFocusNote(focusNoteRequest.noteId);
  }, [focusNoteRequest, handleFocusNote]);

  useEffect(() => {
    if (
      !createNoteFromWikilinkRequest ||
      lastHandledCreateNoteFromWikilinkRequestIdRef.current ===
        createNoteFromWikilinkRequest.requestId
    ) {
      return;
    }

    lastHandledCreateNoteFromWikilinkRequestIdRef.current =
      createNoteFromWikilinkRequest.requestId;
    handleCreateNoteFromWikilink(createNoteFromWikilinkRequest);
  }, [createNoteFromWikilinkRequest, handleCreateNoteFromWikilink]);
}
