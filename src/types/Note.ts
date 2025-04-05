export type InsertNote = {
  notebookId?: string;
  tags: string[];
};

export type Note = {
  _id: string;
  _rev: string | undefined;
  type: "note";
  kind: "1" | "30023" | "1337";
  filetype: string;
  extension: string;
  title: string;
  content: string;
  previewContent: string;
  tags: string[];
  notebookId: string | undefined;
  createdAt: string;
  updatedAt: string;
  editedAt: string;
  publishedAt: string | undefined;
  eventId: string | undefined;
  naddr: string | undefined;
  nevent: string | undefined;
  identifier: string | undefined;
  pinnedAt: string | undefined;
  trashedAt: string | undefined;
  archivedAt: string | undefined;
  author: string | undefined;
};
