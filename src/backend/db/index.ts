import { type Note } from "$/types/Note";
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
  const notes = await db.find({
    selector: { type: "note" },
    fields: ["_id", "content"],
  });
  for (const note of notes.docs as Note[]) {
    let updateQuery: string;
    let insertQuery: string;
    let updateParams: string[];
    let insertParams: string[];

    if (note.notebookId) {
      updateQuery =
        "UPDATE notes_fts SET content = ?, notebookId = ? WHERE doc_id = ?";
      updateParams = [note.content, note.notebookId, note._id];
      insertQuery =
        "INSERT INTO notes_fts (doc_id, content, notebookId) VALUES (?, ?, ?)";
      updateParams = [note._id, note.content, note.notebookId];
    } else {
      updateQuery = "UPDATE notes_fts SET content = ? WHERE doc_id = ?";
      updateParams = [note.content, note._id];
      insertQuery = "INSERT INTO notes_fts (doc_id, content) VALUES (?, ?)";
      insertParams = [note._id, note.content];
    }

    dbFts.run(
      updateQuery,

      updateParams,

      function (err) {
        if (err) {
          console.error("Error updating FTS index during initial sync:", err);
        } else if (this.changes === 0) {
          // No rows updated, so insert a new row
          dbFts.run(insertQuery, insertParams, (err) => {
            if (err) {
              console.error(
                "Error inserting into FTS index during initial sync:",
                err,
              );
            }
          });
        }
      },
    );
  }

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
        console.log("processing", change.doc._id);

        let updateQuery: string;
        let insertQuery: string;
        let updateParams: string[];
        let insertParams: string[];

        console.log("change.doc", change.doc);

        if ((change.doc as Note).notebookId) {
          updateQuery =
            "UPDATE notes_fts SET content = ?, notebookId = ? WHERE doc_id = ?";
          updateParams = [
            (change.doc as Note).content,
            (change.doc as Note).notebookId ?? "",
            change.doc._id,
          ];
          insertQuery =
            "INSERT INTO notes_fts (doc_id, content, notebookId) VALUES (?, ?, ?)";
          insertParams = [
            change.doc?._id,
            (change.doc as Note)?.content,
            (change.doc as Note)?.notebookId ?? "",
          ];
        } else {
          updateQuery = "UPDATE notes_fts SET content = ? WHERE doc_id = ?";
          insertQuery = "INSERT INTO notes_fts (doc_id, content) VALUES (?, ?)";
          updateParams = [(change.doc as Note).content, change.doc._id];
          insertParams = [change.doc?._id, (change.doc as Note)?.content];
        }

        console.log("updateQuery", updateQuery);
        console.log("insertQuery", insertQuery);

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
    "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(doc_id, content, notebookId)",
  );
  await syncFtsIndex(dbFts);

  const info = await db.info();
  console.log("db info", info);

  await createIndexes(db);
  await setupDesignDoc(db);

  return db;
}

export const getDb = () => db;
export const getDbFts = () => dbFts;
