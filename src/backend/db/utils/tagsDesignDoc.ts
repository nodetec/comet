const designDoc = {
  _id: "_design/tags",
  views: {
    allTags: {
      map: `function(doc) {
        if (doc.type === "note" && doc.tags && Array.isArray(doc.tags)) {
          doc.tags.forEach(function(tag) {
            emit(tag, null);
          });
        }
      }`,
      reduce: "_count",
    },
    tagsByNotebook: {
      map: `function(doc) {
        if (doc.type === "note" && doc.notebookId && doc.tags && Array.isArray(doc.tags)) {
          doc.tags.forEach(function(tag) {
            emit([doc.notebookId, tag], null);
          });
        }
      }`,
      reduce: "_count",
    },
  },
};

export async function setupDesignDoc(db: PouchDB.Database) {
  try {
    await db.put(designDoc);
    console.log("Design document created.");
  } catch (err) {
    // TODO: fix this type
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    if (err.status !== 409) {
      // Ignore if it already exists
      console.error("Error creating design document:", err);
      throw err;
    }
  }
}
