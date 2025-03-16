export type InsertNote = {
  notebookId?: string;
  tags: string[];
};

export type Note = {
  _id: string;
  _rev: string | undefined;
  type: "note";
  title: string;
  content: string;
  tags: string[];
  notebookId: string | undefined;
  createdAt: string;
  updatedAt: string;
  contentUpdatedAt: string;
  publishedAt: string | undefined;
  eventAddress: string | undefined;
  identifier: string | undefined;
  pinnedAt: string | undefined;
  trashedAt: string | undefined;
  archivedAt: string | undefined;
  author: string | undefined;
};
