export type APIResponse<T> = {
  success: boolean;
  message: string | undefined;
  data: T | undefined;
};

export type CreateNoteRequest = {
  title: string;
  content: string;
};

export type UpdateNoteRequest = {
  id: number;
  title: string;
  content: string;
};

export type Note = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  modifiedAt: string;
};

export type ActiveNote = {
  id?: number;
  title?: string;
  content?: string;
  createdAt: string;
  modifiedAt: string;
};

export type CreateTagRequest = {
  name: string;
  color: string;
  icon: string;
};

export type GetTagRequest = {
 id?: number;
 name?: string;
}

export type Tag = {
  id: number;
  name: string;
  color: string;
  createdAt: string;
  modifiedAt: string;
};

export type ActiveTag = {
  id?: number;
  name?: string;
  color?: string;
  createdAt: string;
  modifiedAt: string;
};

export type TagNoteRequest = {
  noteId: number;
  tagId: number;
};

export type ListNotesRequest = {
  tagId?: number;
  search?: string;
};




