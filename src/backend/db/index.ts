import type { Note } from "$/types/Note";
import type { Notebook } from "$/types/Notebook";
import PouchDB from "pouchdb";
import PouchDBFind from "pouchdb-find";
import sqlite3, { type Database } from "sqlite3";

import { createIndexes } from "./utils/createIndexes";
import { setupDesignDoc } from "./utils/tagsDesignDoc";

PouchDB.plugin(PouchDBFind);

let db: PouchDB.Database;
let sync: PouchDB.Replication.Sync<{}> | undefined;
let dbFts: Database;
let dbReady = false;

// Function to run SQLite queries as promises
function runQuery(
  db: Database,
  query: string,
  params: unknown[] = [],
): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(query, params, (err) => {
      if (err) {
        console.error(`Error executing query: ${query}`, err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Check if the notes table exists
async function ensureTableExists(db: Database): Promise<boolean> {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes'",
      [],
      (err, row) => {
        if (err) {
          console.error("Error checking if table exists:", err);
          reject(err);
        } else {
          resolve(!!row);
        }
      },
    );
  });
}

async function syncFtsIndex(dbFts: Database) {
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
        dbFts.run("DELETE FROM notes WHERE doc_id = ?", [change.id], (err) => {
          if (err) {
            console.error("Error deleting from notes table:", err);
          }
        });
      } else if (change.doc) {
        const doc = change.doc;

        if ((doc as Note | Notebook).type !== "note") {
          return;
        }

        const note = doc as Note;

        console.log("updating", note._id);

        const updateQuery =
          "UPDATE notes SET content = ?, notebookId = ?, createdAt = ?, contentUpdatedAt = ?, trashedAt = ? WHERE doc_id = ?";
        const updateParams = [
          note.content,
          note.notebookId,
          note.createdAt,
          note.contentUpdatedAt,
          note.trashedAt,
          note._id,
        ];
        const insertQuery =
          "INSERT INTO notes (doc_id, content, notebookId, createdAt, contentUpdatedAt, trashedAt) VALUES (?, ?, ?, ?, ?, ?)";
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
            console.error("Error updating notes table:", err);
          } else if (this.changes === 0) {
            // No rows updated, so insert a new row
            dbFts.run(insertQuery, insertParams, (err) => {
              if (err) {
                console.error("Error inserting into notes table:", err);
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

  dbFts = new sqlite3.Database(`${dbPath}_notes.sqlite`);

  try {
    // Create the table
    await runQuery(
      dbFts,
      "CREATE TABLE IF NOT EXISTS notes (doc_id TEXT PRIMARY KEY, content TEXT, notebookId TEXT, createdAt TEXT, contentUpdatedAt TEXT, trashedAt TEXT)",
    );

    // Verify the table exists
    const tableExists = await ensureTableExists(dbFts);
    if (!tableExists) {
      console.error(
        "Failed to create notes table - table does not exist after creation",
      );
      throw new Error("Failed to create notes table");
    }

    console.log("Notes table created successfully");

    // Create indexes
    await runQuery(
      dbFts,
      "CREATE INDEX IF NOT EXISTS idx_content ON notes(content)",
    );
    await runQuery(
      dbFts,
      "CREATE INDEX IF NOT EXISTS idx_notebookId ON notes(notebookId)",
    );
    await runQuery(
      dbFts,
      "CREATE INDEX IF NOT EXISTS idx_createdAt ON notes(createdAt)",
    );
    await runQuery(
      dbFts,
      "CREATE INDEX IF NOT EXISTS idx_contentUpdatedAt ON notes(contentUpdatedAt)",
    );
    await runQuery(
      dbFts,
      "CREATE INDEX IF NOT EXISTS idx_trashedAt ON notes(trashedAt)",
    );

    // TODO: think about how to handle this better
    await syncFtsIndex(dbFts);

    const info = await db.info();
    console.log("db info", info);

    await createIndexes(db);
    await setupDesignDoc(db);

    dbReady = true;
    return db;
  } catch (error) {
    console.error("Database initialization failed:", error);
    throw error;
  }
}

export const getDb = () => db;
export const getSync = () => sync;
export const setSync = (newSync: PouchDB.Replication.Sync<{}>) => {
  sync = newSync;
};
export const getDbFts = () => dbFts;
export const isDbReady = () => dbReady;
