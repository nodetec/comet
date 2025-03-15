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
  createdAt: Date;
  updatedAt: Date;
  contentUpdatedAt: Date;
  publishedAt: Date | undefined;
  eventAddress: string | undefined;
  identifier: string | undefined;
  pinnedAt: Date | undefined;
  trashedAt: Date | undefined;
  archivedAt: Date | undefined;
  author: string | undefined;
};
