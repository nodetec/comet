import PouchDB from "pouchdb";
import PouchDBFind from "pouchdb-find";

PouchDB.plugin(PouchDBFind);

let db: PouchDB.Database;

export async function initDb(dbPath: string) {
  db = new PouchDB(dbPath, {
    revs_limit: 3,
    auto_compaction: true,
  });

  void PouchDB.sync(dbPath, "http://localhost:5984/mydb", {
    live: true,
  } );

  // when we need to update indexex, just get thema all delete them if
  // they match the old name and create a new with with a new name
  // version names like note-index-v1, note-index-v2, etc

  await db.createIndex({
    index: {
      fields: [
        "contentUpdatedAt",
        "type",
        "trashedAt",
        "notebookId",
        "pinnedAt",
      ],
      name: "note-index-contentUpdatedAt",
    },
  });

  const index = await db.createIndex({
    index: {
      fields: ["name", "type", "hidden"],
      name: "notebook-name-index",
    },
  });

  console.log("notebook name index", index);

  // check if all notebook exists if not create it

  return db;
}

export const getDb = () => db;

export const logDbInfo = async () => {
  const info = await db.info();
  console.log("db location", info);
};
