export type NoteTag = {
  _id: string;
  _rev: string | undefined;
  type: "note_tag";
  noteId: string;
  tagId: string;
  createdAt: Date;
  updatedAt: Date;
};
