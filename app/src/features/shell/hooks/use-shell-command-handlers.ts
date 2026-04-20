import { useCommandRequest } from "@/shared/hooks/use-command-request";
import { canonicalizeTagPath } from "@/shared/lib/tags";
import { useCommandStore } from "@/shared/stores/use-command-store";
import type { NoteFilter } from "@/shared/api/types";
import { useNavigationStore } from "@/shared/stores/use-navigation-store";

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
    useNavigationStore((state) => state.actions);
  const createNoteFromWikilinkRequest = useCommandStore(
    (state) => state.createNoteFromWikilinkRequest,
  );
  const focusNoteRequest = useCommandStore((state) => state.focusNoteRequest);
  const focusTagPathRequest = useCommandStore(
    (state) => state.focusTagPathRequest,
  );
  useCommandRequest(focusTagPathRequest, (request) => {
    const tagPath = canonicalizeTagPath(request.tagPath);
    if (!tagPath) {
      return;
    }

    setFocusedPane("notes");
    handleSelectTagPath(tagPath);
  });

  useCommandRequest(focusNoteRequest, (request) => {
    const noteId = request.noteId.trim();
    if (!noteId) {
      return;
    }

    setFocusedPane("notes");
    handleSelectNote(noteId);
  });

  useCommandRequest(createNoteFromWikilinkRequest, (request) => {
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
  });
}
