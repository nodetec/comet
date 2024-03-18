export type APIResponse<T> = {
  success: boolean;
  message: string | undefined;
  data: T | undefined;
};

export type CreateNoteRequest = {
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
