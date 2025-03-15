// when we need to update indexex, just get thema all delete them if
// they match the old name and create a new with with a new name
// version names like note-index-v1, note-index-v2, etc
export function createIndexes(db: PouchDB.Database) {
  return Promise.all([
    db.createIndex({
      index: {
        fields: ["contentUpdatedAt", "type", "trashedAt", "notebookId", "tags"],
        name: "note-index-contentUpdatedAt",
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
