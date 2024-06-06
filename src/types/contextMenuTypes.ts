export type NoteItemContextMenuRequest = {
  NoteItem: {
    id: number;
  };
};

export type TagItemContextMenuRequest = {
  TagItem: {
    id: number;
  };
};

export type NoteTagItemContextMenuRequest = {
  NoteTag: {
    noteId: number;
    tagId: number;
  };
};

export type CreateContextMenuRequest = {
  menuKind:
    | NoteItemContextMenuRequest
    | TagItemContextMenuRequest
    | NoteTagItemContextMenuRequest;
};

export type NoteItemContextMenuEventPayload = {
  NoteItem: {
    id: number;
    eventKind: string;
  };
};

export type TagItemContextMenuEventPayload = {
  TagItem: {
    id: number;
    eventKind: string;
  };
};

export type NoteTagItemContextMenuEventPayload = {
  NoteTag: {
    noteId: number;
    tagId: number;
    eventKind: string;
  };
};

export type ContextMenuEventPayload = {
  contextMenuEventKind:
    | NoteItemContextMenuEventPayload
    | TagItemContextMenuEventPayload
    | NoteTagItemContextMenuEventPayload;
};
