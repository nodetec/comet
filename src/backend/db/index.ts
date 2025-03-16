import { type Note } from "$/types/Note";
import { type Notebook } from "$/types/Notebook";
import PouchDB from "pouchdb";
import PouchDBFind from "pouchdb-find";
import sqlite3, { type Database } from "sqlite3";

import { createIndexes } from "./utils/createIndexes";
import { setupDesignDoc } from "./utils/tagsDesignDoc";

PouchDB.plugin(PouchDBFind);

let db: PouchDB.Database;
let dbFts: Database;

async function syncFtsIndex(dbFts: Database) {
  // Initial sync: Populate the FTS table with existing notes
  // TODO: this runs on every app start, which is inefficient
  // const notes = await db.find({
  //   selector: {
  //     type: "note",
  //   },
  //   fields: [
  //     "_id",
  //     "content",
  //     "notebookId",
  //     "createdAt",
  //     "contentUpdatedAt",
  //     "trashedAt",
  //   ],
  // });

  // for (const note of notes.docs as Note[]) {
  //   const updateQuery =
  //     "UPDATE notes_fts SET content = ?, notebookId = ?, createdAt = ?, contentUpdatedAt = ?, trashedAt = ? WHERE doc_id = ?";
  //   const updateParams = [
  //     note.content,
  //     note.notebookId,
  //     note.createdAt,
  //     note.contentUpdatedAt,
  //     note.trashedAt,
  //     note._id,
  //   ];
  //   const insertQuery =
  //     "INSERT INTO notes_fts (doc_id, content, notebookId, createdAt, contentUpdatedAt, trashedAt) VALUES (?, ?, ?, ?, ?, ?)";
  //   const insertParams = [
  //     note._id,
  //     note.content,
  //     note.notebookId,
  //     note.createdAt,
  //     note.contentUpdatedAt,
  //     note.trashedAt,
  //   ];

  //   dbFts.run(
  //     updateQuery,

  //     updateParams,

  //     function (err) {
  //       if (err) {
  //         console.error("Error updating FTS index during initial sync:", err);
  //       } else if (this.changes === 0) {
  //         // No rows updated, so insert a new row
  //         dbFts.run(insertQuery, insertParams, (err) => {
  //           if (err) {
  //             console.error(
  //               "Error inserting into FTS index during initial sync:",
  //               err,
  //             );
  //           }
  //         });
  //       }
  //     },
  //   );
  // }

  // Live updates via changes feed
  void db
    .changes({
      since: "now",
      live: true,
      include_docs: true,
      filter: (doc: Note) => doc.type === "note",
    })
    .on("change", (change) => {
      if (change.deleted) {
        console.log("deleting", change.id);
        dbFts.run(
          "DELETE FROM notes_fts WHERE doc_id = ?",
          [change.id],
          (err) => {
            if (err) {
              console.error("Error deleting from FTS index:", err);
            }
          },
        );
      } else if (change.doc) {
        const doc = change.doc;

        if ((doc as Note | Notebook).type !== "note") {
          return;
        }

        const note = doc as Note;

        console.log("updating", note._id);

        const updateQuery =
          "UPDATE notes_fts SET content = ?, notebookId = ?, createdAt = ?, contentUpdatedAt = ?, trashedAt = ? WHERE doc_id = ?";
        const updateParams = [
          note.content,
          note.notebookId,
          note.createdAt,
          note.contentUpdatedAt,
          note.trashedAt,
          note._id,
        ];
        const insertQuery =
          "INSERT INTO notes_fts (doc_id, content, notebookId, createdAt, contentUpdatedAt, trashedAt) VALUES (?, ?, ?, ?, ?, ?)";
        const insertParams = [
          note._id,
          note.content,
          note.notebookId,
          note.createdAt,
          note.contentUpdatedAt,
          note.trashedAt,
        ];

        dbFts.run(updateQuery, updateParams, function (err) {
          if (err) {
            console.error("Error updating FTS index:", err);
          } else if (this.changes === 0) {
            // No rows updated, so insert a new row
            dbFts.run(insertQuery, insertParams, (err) => {
              if (err) {
                console.error("Error inserting into FTS index:", err);
              }
            });
          }
        });
      }
    });
}

export async function initDb(dbPath: string) {
  db = new PouchDB(dbPath, {
    auto_compaction: true,
  });

  dbFts = new sqlite3.Database(`${dbPath}_fts`);

  dbFts.run(
    "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(doc_id, content, notebookId, createdAt, contentUpdatedAt, trashedAt)",
  );
  // TODO: think about how to handle this better
  await syncFtsIndex(dbFts);

  const info = await db.info();
  console.log("db info", info);

  await createIndexes(db);
  await setupDesignDoc(db);

  return db;
}

export const getDb = () => db;
export const getDbFts = () => dbFts;
