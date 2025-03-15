import PouchDB from "pouchdb";
import PouchDBFind from "pouchdb-find";
// import {  } from "pouchdb-quicker-search";
import PouchDBSearch from 'pouchdb-quicker-search';


import { createIndexes } from "./utils/createIndexes";

// import { trackChanges } from "./utils/trackChanges";

PouchDB.plugin(PouchDBFind);
PouchDB.plugin(PouchDBSearch);

let db: PouchDB.Database;

// const designDoc = {
//   _id: "_design/tags",
//   views: {
//     allTags: {
//       map: `function(doc) {
//         if (doc.tags && Array.isArray(doc.tags)) {
//           doc.tags.forEach(function(tag) {
//             emit(tag, null);
//           });
//         }
//       }`,
//       reduce: "_count",
//     },
//   },
// };
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

async function setupDesignDoc(db: PouchDB.Database) {
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

export async function initDb(dbPath: string) {
  db = new PouchDB(dbPath, {
    auto_compaction: true,
  });

  const info = await db.info();
  console.log("db info", info);

  // void PouchDB.sync(dbPath, "http://localhost:5984/mydb", {
  //   live: true,
  // } );

  //   trackChanges(db);
  await createIndexes(db);
  await setupDesignDoc(db);

  return db;
}

export const getDb = () => db;
