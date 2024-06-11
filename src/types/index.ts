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

type Page<T> = {
  data: T[] | undefined;
  nextPage: number | undefined;
  nextCursor: number | undefined;
  prevCursor: number | undefined;
};

export type InfiniteQueryData<T> = {
  pageParams: number[];
  pages: Page<T>[] | undefined;
};

export type Settings = {
  // theme
  theme?: "light" | "dark";
  // editor
  vim?: "true" | "false";
  line_numbers?: "true" | "false";
  highlight_active_line?: "true" | "false";
  line_wrapping?: "true" | "false";
  // nostr
  public_key?: string;
  private_key?: string;
};

export type SettingsSwitchKeys =
  | "vim"
  | "line_numbers"
  | "highlight_active_line"
  | "line_wrapping"
