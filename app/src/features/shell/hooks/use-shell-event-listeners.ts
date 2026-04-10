import { useEffect } from "react";
import { type RefObject } from "react";

import { canonicalizeTagPath } from "@/features/editor/lib/tags";
import { errorMessage } from "@/shared/lib/utils";
import {
  FOCUS_TAG_PATH_EVENT,
  type FocusTagPathDetail,
} from "@/shared/lib/tag-navigation";
import {
  CREATE_NOTE_FROM_WIKILINK_EVENT,
  type CreateNoteFromWikilinkDetail,
  FOCUS_NOTE_EVENT,
  type FocusNoteDetail,
} from "@/shared/lib/note-navigation";
import type { NoteFilter } from "@/shared/api/types";

interface ShellEventHandlers {
  flushCurrentDraft: () => void;
  flushCurrentDraftAsync: () => Promise<unknown>;
  handleSelectTagPath: (tagPath: string) => void;
  handleSelectNote: (noteId: string) => void;
}

export interface ShellEventListenerDeps {
  latestRef: RefObject<ShellEventHandlers>;
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
  setNoteFilter: (filter: NoteFilter) => void;
  setSearchQuery: (query: string) => void;
  setCreatingSelectedNoteId: (id: string | null) => void;
  setIsCreatingNoteTransition: (v: boolean) => void;
  setFocusedPane: (pane: "sidebar" | "notes" | "editor") => void;
}

export function useShellEventListeners(deps: ShellEventListenerDeps) {
  const {
    latestRef,
    activeTagPath,
    tagViewActive,
    noteFilter,
    isCreatingNote,
    createNoteMutation,
    setNoteFilter,
    setSearchQuery,
    setCreatingSelectedNoteId,
    setIsCreatingNoteTransition,
    setFocusedPane,
  } = deps;

  // --- Account change listener ---
  useEffect(() => {
    const handlePrepareAccountChange = () => {
      void (async () => {
        try {
          await latestRef.current.flushCurrentDraftAsync();
          window.dispatchEvent(
            new CustomEvent("comet:account-change-prepared", {
              detail: { ok: true },
            }),
          );
        } catch (error) {
          window.dispatchEvent(
            new CustomEvent("comet:account-change-prepared", {
              detail: {
                ok: false,
                message: errorMessage(
                  error,
                  "Couldn't save the current draft.",
                ),
              },
            }),
          );
        }
      })();
    };

    window.addEventListener(
      "comet:prepare-account-change",
      handlePrepareAccountChange,
    );
    return () => {
      window.removeEventListener(
        "comet:prepare-account-change",
        handlePrepareAccountChange,
      );
    };
  }, [latestRef]);

  // --- Focus tag path listener ---
  useEffect(() => {
    const handleFocusTagPath = (event: Event) => {
      const customEvent = event as CustomEvent<FocusTagPathDetail>;
      const tagPath = canonicalizeTagPath(customEvent.detail?.tagPath ?? "");
      if (!tagPath) {
        return;
      }

      setFocusedPane("notes");
      latestRef.current.handleSelectTagPath(tagPath);
    };

    window.addEventListener(FOCUS_TAG_PATH_EVENT, handleFocusTagPath);
    return () => {
      window.removeEventListener(FOCUS_TAG_PATH_EVENT, handleFocusTagPath);
    };
  }, [latestRef, setFocusedPane]);

  // --- Focus note listener ---
  useEffect(() => {
    const handleFocusNote = (event: Event) => {
      const customEvent = event as CustomEvent<FocusNoteDetail>;
      const noteId = customEvent.detail?.noteId?.trim();
      if (!noteId) {
        return;
      }

      setFocusedPane("notes");
      latestRef.current.handleSelectNote(noteId);
    };

    window.addEventListener(FOCUS_NOTE_EVENT, handleFocusNote);
    return () => {
      window.removeEventListener(FOCUS_NOTE_EVENT, handleFocusNote);
    };
  }, [latestRef, setFocusedPane]);

  // --- Create note from wikilink listener ---
  useEffect(() => {
    const handleCreateNoteFromWikilink = (event: Event) => {
      const customEvent = event as CustomEvent<CreateNoteFromWikilinkDetail>;
      const title = customEvent.detail?.title?.trim();
      if (!title || isCreatingNote) {
        return;
      }

      latestRef.current.flushCurrentDraft();
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
      setSearchQuery("");
      setCreatingSelectedNoteId(null);
      setFocusedPane("notes");
      setIsCreatingNoteTransition(true);
      createNoteMutation.mutate({
        autoFocusEditor: false,
        tags: tagsForNewNote,
        markdown: `# ${title}`,
      });
    };

    window.addEventListener(
      CREATE_NOTE_FROM_WIKILINK_EVENT,
      handleCreateNoteFromWikilink,
    );
    return () => {
      window.removeEventListener(
        CREATE_NOTE_FROM_WIKILINK_EVENT,
        handleCreateNoteFromWikilink,
      );
    };
  }, [
    activeTagPath,
    createNoteMutation,
    isCreatingNote,
    latestRef,
    noteFilter,
    setCreatingSelectedNoteId,
    setFocusedPane,
    setIsCreatingNoteTransition,
    setNoteFilter,
    setSearchQuery,
    tagViewActive,
  ]);
}
