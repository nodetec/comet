export function trackChanges(db: PouchDB.Database) {
  void db
    .changes({
      since: "now",
      live: true,
      include_docs: true,
    })
    .on("change", (change) => {
      console.log("change", change);
    });
}
