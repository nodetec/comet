"use strict";
// https://pouchdb.com/
// https://pouchdb.com/api.html
// https://pouchdb.com/2014/06/17/12-pro-tips-for-better-code-with-pouchdb.html
// https://pouchdb.com/2014/04/14/pagination-strategies-with-pouchdb.html
// https://pouchdb.com/2015/02/28/efficiently-managing-ui-state-in-pouchdb.html
// https://pouchdb.com/2014/05/01/secondary-indexes-have-landed-in-pouchdb.html
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
exports.createNote = createNote;
exports.getNote = getNote;
exports.getNoteFeed = getNoteFeed;
exports.saveNote = saveNote;
exports.moveNoteToTrash = moveNoteToTrash;
exports.deleteNote = deleteNote;
exports.restoreNote = restoreNote;
exports.addPublishDetailsToNote = addPublishDetailsToNote;
exports.moveNoteToNotebook = moveNoteToNotebook;
exports.createNotebook = createNotebook;
exports.getNotebook = getNotebook;
exports.getNotebooks = getNotebooks;
exports.updateNotebookName = updateNotebookName;
exports.hideNotebook = hideNotebook;
exports.unhideNotebook = unhideNotebook;
exports.deleteNotebook = deleteNotebook;
exports.getAllTags = getAllTags;
exports.getTagsByNotebookId = getTagsByNotebookId;
exports.searchNotes = searchNotes;
exports.syncDb = syncDb;
exports.cancelSync = cancelSync;
exports.getSyncConfig = getSyncConfig;
exports.toggleMaximize = toggleMaximize;
const db_1 = require("&/db");
const syncDb_1 = require("&/db/utils/syncDb");
const store_1 = require("&/store");
const window_1 = require("&/window");
const markdown_1 = require("~/lib/markdown");
const dayjs_1 = __importDefault(require("dayjs"));
const uuid_1 = require("uuid");
// Notes
function createNote(_, insertNote) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        // if there are active tags then add \n and put the tags separated by spaces with #
        const tags = insertNote.tags.map((tag) => `#${tag}`).join(" ");
        let content = "";
        if (tags && tags.length > 0) {
            content = `\n${tags}\n`;
        }
        const note = {
            _id: `note_${(0, uuid_1.v4)()}`,
            _rev: undefined,
            type: "note",
            title: (0, dayjs_1.default)().format("YYYY-MM-DD"),
            content: content,
            previewContent: "",
            tags: insertNote.tags,
            notebookId: insertNote === null || insertNote === void 0 ? void 0 : insertNote.notebookId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            contentUpdatedAt: new Date().toISOString(),
            author: undefined,
            publishedAt: undefined,
            eventAddress: undefined,
            identifier: undefined,
            pinnedAt: undefined,
            trashedAt: undefined,
            archivedAt: undefined,
        };
        const response = yield db.put(note);
        return response.id;
    });
}
function getNote(_, id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const response = yield db.get(id);
        return response;
    });
}
function getNoteFeed(_1, offset_1, limit_1) {
    return __awaiter(this, arguments, void 0, function* (_, offset, limit, sortField = "contentUpdatedAt", sortOrder = "desc", notebookId, trashFeed = false, tags) {
        const db = (0, db_1.getDb)();
        const selector = {
            contentUpdatedAt: { $exists: true },
            type: "note",
            trashedAt: { $exists: trashFeed },
        };
        if (notebookId) {
            selector.notebookId = notebookId;
        }
        if (tags && tags.length > 0) {
            selector.tags = { $all: tags };
        }
        const response = yield db.find({
            selector,
            sort: [{ [sortField]: sortOrder }],
            skip: offset,
            limit,
        });
        return response.docs;
    });
}
function saveNote(_, update) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const db = (0, db_1.getDb)();
        const id = update._id;
        if (!id)
            return;
        const note = yield db.get(id);
        const tags = (0, markdown_1.extractHashtags)((_a = update.content) !== null && _a !== void 0 ? _a : "");
        note.tags = tags;
        note.title = (_b = update.title) !== null && _b !== void 0 ? _b : (0, dayjs_1.default)().format("YYYY-MM-DD");
        note.content = (_c = update.content) !== null && _c !== void 0 ? _c : "";
        note.previewContent = (_e = (0, markdown_1.parseContent)((_d = update.content) !== null && _d !== void 0 ? _d : "")) !== null && _e !== void 0 ? _e : "";
        note.updatedAt = new Date().toISOString();
        note.contentUpdatedAt = new Date().toISOString();
        const response = yield db.put(note);
        return response.id;
    });
}
function moveNoteToTrash(_, id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const note = yield db.get(id);
        note.trashedAt = new Date().toISOString();
        note.updatedAt = new Date().toISOString();
        const response = yield db.put(note);
        return response.id;
    });
}
function deleteNote(_, id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const note = yield db.get(id);
        note.title = "";
        note.content = "";
        note.previewContent = "";
        note.author = "";
        return yield db.remove(note);
    });
}
function restoreNote(_, id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const note = yield db.get(id);
        note.trashedAt = undefined;
        note.updatedAt = new Date().toISOString();
        note.contentUpdatedAt = new Date().toISOString();
        const response = yield db.put(note);
        return response.id;
    });
}
function addPublishDetailsToNote(_, update) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const db = (0, db_1.getDb)();
        const id = update._id;
        if (!id)
            return;
        const note = yield db.get(id);
        note.title = (_a = update.title) !== null && _a !== void 0 ? _a : (0, dayjs_1.default)().format("YYYY-MM-DD");
        note.content = (_b = update.content) !== null && _b !== void 0 ? _b : "";
        note.previewContent = (_d = (0, markdown_1.parseContent)((_c = update.content) !== null && _c !== void 0 ? _c : "")) !== null && _d !== void 0 ? _d : "";
        note.updatedAt = new Date().toISOString();
        note.contentUpdatedAt = new Date().toISOString();
        note.author = update.author;
        note.publishedAt = update.publishedAt;
        note.eventAddress = update.eventAddress;
        note.identifier = update.identifier;
        const response = yield db.put(note);
        return response.id;
    });
}
function moveNoteToNotebook(_, noteId, notebookId) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const note = yield db.get(noteId);
        note.notebookId = notebookId;
        note.updatedAt = new Date().toISOString();
        note.contentUpdatedAt = new Date().toISOString();
        const response = yield db.put(note);
        return response.id;
    });
}
// Notebooks
function createNotebook(_, name) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        // look up the notebook by name
        const findResponse = yield db.find({
            selector: {
                type: "notebook",
                name,
            },
        });
        if (findResponse.docs.length > 0) {
            throw new Error("Notebook with that name already exists");
        }
        const notebook = {
            _id: `notebook_${(0, uuid_1.v4)()}`,
            type: "notebook",
            name,
            hidden: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const response = yield db.put(notebook);
        return response.id;
    });
}
function getNotebook(_, id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const response = yield db.get(id);
        return response;
    });
}
function getNotebooks(_1) {
    return __awaiter(this, arguments, void 0, function* (_, showHidden = false) {
        const db = (0, db_1.getDb)();
        const selector = {
            name: { $gt: null },
            type: "notebook",
            hidden: showHidden ? { $exists: true } : false,
        };
        const response = yield db.find({
            selector,
            sort: [{ name: "asc" }],
        });
        // If you need to filter out null names, do it after the query
        const notebooks = response.docs;
        return notebooks;
    });
}
function updateNotebookName(_, update) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const db = (0, db_1.getDb)();
        const id = update._id;
        if (!id)
            return;
        const notebook = yield db.get(id);
        notebook.name = (_a = update.name) !== null && _a !== void 0 ? _a : "";
        notebook.updatedAt = new Date().toISOString();
        const response = yield db.put(notebook);
        return response.id;
    });
}
function hideNotebook(event, id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const notebook = yield db.get(id);
        notebook.hidden = true;
        notebook.updatedAt = new Date().toISOString();
        const response = yield db.put(notebook);
        event.sender.send("notebookHidden", id);
        return response.id;
    });
}
function unhideNotebook(_, id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const notebook = yield db.get(id);
        notebook.hidden = false;
        notebook.updatedAt = new Date().toISOString();
        const response = yield db.put(notebook);
        return response.id;
    });
}
function deleteNotebook(event, id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const notebook = yield db.get(id);
        const notesResponse = yield db.find({
            selector: {
                type: "note",
                notebookId: id,
            },
        });
        for (const note of notesResponse.docs) {
            note.notebookId = undefined;
            yield db.put(note);
        }
        notebook.name = "";
        yield db.remove(notebook);
        event.sender.send("notebookDeleted", id);
        return id;
    });
}
function getAllTags() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        try {
            // Query the 'allTags' view with grouping to get unique tags
            const result = yield db.query("tags/allTags", {
                group: true,
            });
            // Extract the unique tags from the result rows
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            const uniqueTags = result.rows.map((row) => row.key);
            // TODO: we can probably return the count too with row.value
            return uniqueTags;
        }
        catch (err) {
            console.error("Error getting all tags:", err);
            throw err; // Re-throw the error for the caller to handle
        }
    });
}
function getTagsByNotebookId(_, notebookId) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const result = yield db.query("tags/tagsByNotebook", {
            startkey: [notebookId],
            endkey: [notebookId, {}],
            group: true,
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return result.rows.map((row) => row.key[1]);
    });
}
// TODO: add notebook id to fts as well
function searchNotes(_, searchTerm, limit, offset, trashed, // Add parameter with default value false
notebookId) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, db_1.getDb)();
        const dbFts = (0, db_1.getDbFts)();
        // Return empty array if search term is empty or just whitespace
        if (!searchTerm.trim()) {
            return [];
        }
        const literalQuery = `%${searchTerm.trim()}%`;
        let selectQuery;
        let selectParams;
        // Add trashedAt condition based on the trashed parameter
        const trashedCondition = trashed
            ? "trashedAt IS NOT NULL"
            : "trashedAt IS NULL";
        if (notebookId) {
            selectQuery = `SELECT doc_id FROM notes WHERE content LIKE ? AND notebookId = ? AND ${trashedCondition} ORDER BY contentUpdatedAt DESC LIMIT ? OFFSET ?`;
            selectParams = [literalQuery, notebookId, limit, offset];
        }
        else {
            selectQuery = `SELECT doc_id FROM notes WHERE content LIKE ? AND ${trashedCondition} ORDER BY contentUpdatedAt DESC LIMIT ? OFFSET ?`;
            selectParams = [literalQuery, limit, offset];
        }
        try {
            const rows = (yield new Promise((resolve, reject) => {
                dbFts.all(selectQuery, selectParams, (err, rows) => {
                    if (err) {
                        console.error("Error searching notes table:", err);
                        reject(err);
                        return;
                    }
                    resolve(rows);
                });
            }));
            const docIds = rows.map((row) => row.doc_id);
            // Fetch full documents from PouchDB using the doc_ids
            const pouchDbResult = yield db.allDocs({
                keys: docIds,
                include_docs: true,
            });
            const pouchDbRows = pouchDbResult.rows;
            // Filter out any missing documents and map to Note type
            const notes = pouchDbRows
                .filter((row) => "doc" in row && row.doc) // Ensure doc exists
                .map((row) => {
                if ("doc" in row && row.doc) {
                    return row.doc;
                }
                return null;
            })
                .filter((note) => note !== null);
            return notes;
        }
        catch (err) {
            console.error("Error fetching documents from PouchDB:", err);
            throw err;
        }
    });
}
function syncDb(_, remoteUrl) {
    (0, syncDb_1.sync)(remoteUrl);
    const store = (0, store_1.getStore)();
    store.set({
        sync: {
            remote: {
                url: remoteUrl,
            },
            method: "custom_sync",
        },
    });
}
function cancelSync() {
    const sync = (0, db_1.getSync)();
    const store = (0, store_1.getStore)();
    if (sync) {
        sync.cancel();
        store.set({
            sync: {
                remote: {
                    url: undefined,
                },
                method: "no_sync",
            },
        });
    }
}
function getSyncConfig() {
    const store = (0, store_1.getStore)();
    return store.get("sync");
}
function toggleMaximize(_) {
    const mainWindow = (0, window_1.getWindow)();
    console.log("mainWindow", mainWindow);
    console.log("isMaximized", mainWindow.isMaximized());
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    }
    else {
        mainWindow.maximize();
    }
}
//# sourceMappingURL=index.js.map