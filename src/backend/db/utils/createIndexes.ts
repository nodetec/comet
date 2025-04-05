// when we need to update indexex, just get thema all delete them if
// they match the old name and create a new with with a new name
// version names like note-index-v1, note-index-v2, etc
export function createIndexes(db: PouchDB.Database) {
  return Promise.all([
    db.createIndex({
      index: {
        fields: ["editedAt", "type", "trashedAt", "notebookId", "tags"],
        name: "note-index-editedAt",
      },
    }),
    db.createIndex({
      index: {
        fields: ["createdAt", "type", "trashedAt", "notebookId", "tags"],
        name: "note-index-createdAt",
      },
    }),
    db.createIndex({
      index: {
        fields: ["title", "type", "trashedAt", "notebookId", "tags"],
        name: "note-index-title",
      },
    }),
    db.createIndex({
      index: {
        fields: ["editedAt", "type", "trashedAt", "tags"],
        name: "note-index-editedAt-all",
      },
    }),
    db.createIndex({
      index: {
        fields: ["createdAt", "type", "trashedAt", "tags"],
        name: "note-index-createdAt-all",
      },
    }),
    db.createIndex({
      index: {
        fields: ["title", "type", "trashedAt", "tags"],
        name: "note-index-title-all",
      },
    }),
    db.createIndex({
      index: {
        fields: ["tags"],
        name: "note-tags-index",
      },
    }),
    db.createIndex({
      index: {
        fields: ["name", "type", "hidden"],
        name: "notebook-name-index",
      },
    }),
  ]);
}
