"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDbReady = exports.getDbFts = exports.setSync = exports.getSync = exports.getDb = void 0;
exports.initDb = initDb;
const pouchdb_1 = __importDefault(require("pouchdb"));
const pouchdb_find_1 = __importDefault(require("pouchdb-find"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const createIndexes_1 = require("./utils/createIndexes");
const tagsDesignDoc_1 = require("./utils/tagsDesignDoc");
pouchdb_1.default.plugin(pouchdb_find_1.default);
let db;
let sync;
let dbFts;
let dbReady = false;
// Function to run SQLite queries as promises
function runQuery(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, (err) => {
            if (err) {
                console.error(`Error executing query: ${query}`, err);
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}
// Check if the notes table exists
function ensureTableExists(db) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'", [], (err, row) => {
                if (err) {
                    console.error("Error checking if table exists:", err);
                    reject(err);
                }
                else {
                    resolve(!!row);
                }
            });
        });
    });
}
function syncFtsIndex(dbFts) {
    return __awaiter(this, void 0, void 0, function* () {
        // Live updates via changes feed
        void db
            .changes({
            since: "now",
            live: true,
            include_docs: true,
            filter: (doc) => doc.type === "note",
        })
            .on("change", (change) => {
            if (change.deleted) {
                console.log("deleting", change.id);
                dbFts.run("DELETE FROM notes WHERE doc_id = ?", [change.id], (err) => {
                    if (err) {
                        console.error("Error deleting from notes table:", err);
                    }
                });
            }
            else if (change.doc) {
                const doc = change.doc;
                if (doc.type !== "note") {
                    return;
                }
                const note = doc;
                console.log("updating", note._id);
                const updateQuery = "UPDATE notes SET content = ?, notebookId = ?, createdAt = ?, contentUpdatedAt = ?, trashedAt = ? WHERE doc_id = ?";
                const updateParams = [
                    note.content,
                    note.notebookId,
                    note.createdAt,
                    note.contentUpdatedAt,
                    note.trashedAt,
                    note._id,
                ];
                const insertQuery = "INSERT INTO notes (doc_id, content, notebookId, createdAt, contentUpdatedAt, trashedAt) VALUES (?, ?, ?, ?, ?, ?)";
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
                    }
                    else if (this.changes === 0) {
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
    });
}
function initDb(dbPath) {
    return __awaiter(this, void 0, void 0, function* () {
        db = new pouchdb_1.default(dbPath, {
            auto_compaction: true,
        });
        dbFts = new sqlite3_1.default.Database(`${dbPath}_notes.sqlite`);
        try {
            // Create the table
            yield runQuery(dbFts, "CREATE TABLE IF NOT EXISTS notes (doc_id TEXT PRIMARY KEY, content TEXT, notebookId TEXT, createdAt TEXT, contentUpdatedAt TEXT, trashedAt TEXT)");
            // Verify the table exists
            const tableExists = yield ensureTableExists(dbFts);
            if (!tableExists) {
                console.error("Failed to create notes table - table does not exist after creation");
                throw new Error("Failed to create notes table");
            }
            console.log("Notes table created successfully");
            // Create indexes
            yield runQuery(dbFts, "CREATE INDEX IF NOT EXISTS idx_content ON notes(content)");
            yield runQuery(dbFts, "CREATE INDEX IF NOT EXISTS idx_notebookId ON notes(notebookId)");
            yield runQuery(dbFts, "CREATE INDEX IF NOT EXISTS idx_createdAt ON notes(createdAt)");
            yield runQuery(dbFts, "CREATE INDEX IF NOT EXISTS idx_contentUpdatedAt ON notes(contentUpdatedAt)");
            yield runQuery(dbFts, "CREATE INDEX IF NOT EXISTS idx_trashedAt ON notes(trashedAt)");
            // TODO: think about how to handle this better
            yield syncFtsIndex(dbFts);
            const info = yield db.info();
            console.log("db info", info);
            yield (0, createIndexes_1.createIndexes)(db);
            yield (0, tagsDesignDoc_1.setupDesignDoc)(db);
            dbReady = true;
            return db;
        }
        catch (error) {
            console.error("Database initialization failed:", error);
            throw error;
        }
    });
}
const getDb = () => db;
exports.getDb = getDb;
const getSync = () => sync;
exports.getSync = getSync;
const setSync = (newSync) => {
    sync = newSync;
};
exports.setSync = setSync;
const getDbFts = () => dbFts;
exports.getDbFts = getDbFts;
const isDbReady = () => dbReady;
exports.isDbReady = isDbReady;
//# sourceMappingURL=index.js.map