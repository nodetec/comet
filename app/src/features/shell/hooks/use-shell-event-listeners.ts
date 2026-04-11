import { useEffect, useEffectEvent } from "react";

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
import { useShellNavigationStore } from "@/features/shell/store/use-shell-navigation-store";

export interface ShellEventListenerDeps {
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
  flushCurrentDraftAsync: () => Promise<unknown>;
  handleSelectTagPath: (tagPath: string) => void;
  handleSelectNote: (noteId: string) => void;
}

export function useShellEventListeners(deps: ShellEventListenerDeps) {
  const {
    activeTagPath,
    tagViewActive,
    noteFilter,
    isCreatingNote,
    createNoteMutation,
    flushCurrentDraft,
    flushCurrentDraftAsync,
    handleSelectTagPath,
    handleSelectNote,
  } = deps;

  const { setNoteFilter, setFocusedPane, prepareNoteCreation } =
    useShellNavigationStore((state) => state.actions);

  const handlePrepareAccountChange = useEffectEvent(() => {
    void (async () => {
      try {
        await flushCurrentDraftAsync();
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
              message: errorMessage(error, "Couldn't save the current draft."),
            },
          }),
        );
      }
    })();
  });

  const handleFocusTagPath = useEffectEvent((event: Event) => {
    const customEvent = event as CustomEvent<FocusTagPathDetail>;
    const tagPath = canonicalizeTagPath(customEvent.detail?.tagPath ?? "");
    if (!tagPath) {
      return;
    }

    setFocusedPane("notes");
    handleSelectTagPath(tagPath);
  });

  const handleFocusNote = useEffectEvent((event: Event) => {
    const customEvent = event as CustomEvent<FocusNoteDetail>;
    const noteId = customEvent.detail?.noteId?.trim();
    if (!noteId) {
      return;
    }

    setFocusedPane("notes");
    handleSelectNote(noteId);
  });

  const handleCreateNoteFromWikilink = useEffectEvent((event: Event) => {
    const customEvent = event as CustomEvent<CreateNoteFromWikilinkDetail>;
    const title = customEvent.detail?.title?.trim();
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
  });

  // --- Account change listener ---
  useEffect(() => {
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
  }, []);

  // --- Focus tag path listener ---
  useEffect(() => {
    window.addEventListener(FOCUS_TAG_PATH_EVENT, handleFocusTagPath);
    return () => {
      window.removeEventListener(FOCUS_TAG_PATH_EVENT, handleFocusTagPath);
    };
  }, []);

  // --- Focus note listener ---
  useEffect(() => {
    window.addEventListener(FOCUS_NOTE_EVENT, handleFocusNote);
    return () => {
      window.removeEventListener(FOCUS_NOTE_EVENT, handleFocusNote);
    };
  }, []);

  // --- Create note from wikilink listener ---
  useEffect(() => {
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
  }, []);
}
