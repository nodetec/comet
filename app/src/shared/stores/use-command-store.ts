import { create } from "zustand";

export type FocusNotesPaneDetail = {
  selection?: "first" | "selected";
};

export type FocusEditorDetail = {
  scrollTo?: "preserve" | "top";
};

export type FocusNoteRequest = {
  noteId: string;
  requestId: number;
};

export type FocusTagPathRequest = {
  requestId: number;
  tagPath: string;
};

export type CreateNoteFromWikilinkDetail = {
  location: number;
  sourceNoteId: string;
  title: string;
};

export type CreateNoteFromWikilinkRequest = CreateNoteFromWikilinkDetail & {
  requestId: number;
};

export type FocusNotesPaneRequest = FocusNotesPaneDetail & {
  requestId: number;
};

export type FocusEditorRequest = FocusEditorDetail & {
  requestId: number;
};

type CommandActions = {
  requestCreateNoteFromWikilink(detail: CreateNoteFromWikilinkDetail): void;
  requestFocusEditor(detail?: FocusEditorDetail): void;
  requestFocusNote(noteId: string): void;
  requestFocusNotesPane(detail?: FocusNotesPaneDetail): void;
  requestFocusNotesSearch(): void;
  requestFocusTagPath(tagPath: string): void;
  requestOpenEditorFind(): void;
};

type CommandDataState = {
  createNoteFromWikilinkRequest: CreateNoteFromWikilinkRequest | null;
  editorFindRequestId: number;
  focusEditorRequest: FocusEditorRequest | null;
  focusNoteRequest: FocusNoteRequest | null;
  focusNotesPaneRequest: FocusNotesPaneRequest | null;
  focusNotesSearchRequestId: number;
  focusTagPathRequest: FocusTagPathRequest | null;
  nextRequestId: number;
};

type CommandState = CommandDataState & {
  actions: CommandActions;
};

export const EMPTY_COMMAND_STATE = {
  createNoteFromWikilinkRequest: null,
  editorFindRequestId: 0,
  focusEditorRequest: null,
  focusNoteRequest: null,
  focusNotesPaneRequest: null,
  focusNotesSearchRequestId: 0,
  focusTagPathRequest: null,
  nextRequestId: 1,
} satisfies CommandDataState;

export function resetCommandState() {
  useCommandStore.setState(EMPTY_COMMAND_STATE);
}

const useCommandStore = create<CommandState>((set) => ({
  ...EMPTY_COMMAND_STATE,
  actions: {
    requestCreateNoteFromWikilink: (detail) => {
      set((state) => ({
        createNoteFromWikilinkRequest: {
          requestId: state.nextRequestId,
          ...detail,
        },
        nextRequestId: state.nextRequestId + 1,
      }));
    },
    requestFocusEditor: (detail) => {
      set((state) => ({
        focusEditorRequest: {
          requestId: state.nextRequestId,
          ...detail,
        },
        nextRequestId: state.nextRequestId + 1,
      }));
    },
    requestFocusNote: (noteId) => {
      set((state) => ({
        focusNoteRequest: {
          noteId,
          requestId: state.nextRequestId,
        },
        nextRequestId: state.nextRequestId + 1,
      }));
    },
    requestFocusNotesPane: (detail) => {
      set((state) => ({
        focusNotesPaneRequest: {
          requestId: state.nextRequestId,
          ...detail,
        },
        nextRequestId: state.nextRequestId + 1,
      }));
    },
    requestFocusNotesSearch: () => {
      set((state) => ({
        focusNotesSearchRequestId: state.nextRequestId,
        nextRequestId: state.nextRequestId + 1,
      }));
    },
    requestFocusTagPath: (tagPath) => {
      set((state) => ({
        focusTagPathRequest: {
          requestId: state.nextRequestId,
          tagPath,
        },
        nextRequestId: state.nextRequestId + 1,
      }));
    },
    requestOpenEditorFind: () => {
      set((state) => ({
        editorFindRequestId: state.nextRequestId,
        nextRequestId: state.nextRequestId + 1,
      }));
    },
  },
}));

export { useCommandStore };
