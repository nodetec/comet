export type APIResponse<T> =
  | { data: T; error: never }
  | { data: never; error: string };

export type CreateNoteRequest = {
  content: string;
};

export type UpdateNoteRequest = {
  id: number;
  content: string;
};

export type Note = {
  id: number;
  content: string;
  createdAt: string;
  modifiedAt: string | null;
  trashedAt: string | null;
  tags: Tag[];
};

type Filter = "all" | "trashed" | "archived";

export type AppContext = {
  filter: Filter;
  currentNote?: Note;
  currentTrashedNote?: Note;
  activeTag?: Tag;
};

export type CreateTagRequest = {
  name: string;
  color: string;
  icon: string;
  noteId?: number;
};

export type GetTagRequest = {
  id?: number;
  name?: string;
};

export type ListTagsRequest = {
  noteId?: number;
};

export type Tag = {
  id: number;
  name: string;
  color: string;
  createdAt: string;
  modifiedAt: string;
};

export type TagNoteRequest = {
  noteId: number;
  tagId: number;
};

export type ListNotesRequest = {
  filter: Filter;
  page: number;
  pageSize: number;
  tagId?: number;
  search?: string;
  sortBy?: string;
  status?: "active" | "completed" | "pending" | "published";
};

export type CreateContextMenuRequest = {
  menuKind: "TagItem" | "NoteItem";
  id?: number;
};

export type ContextMenuEventPayload = {
  eventKind: string;
  id?: number;
};

type Page<T> = {
  data: T[];
  nextPage: number | null;
  nextCursor: number | null;
  prevCursor: number | null;
};

export type InfiniteQueryData<T> = {
  pageParams: number[];
  pages: Page<T>[];
};
