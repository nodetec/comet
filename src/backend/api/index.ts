// https://pouchdb.com/
// https://pouchdb.com/api.html
// https://pouchdb.com/2014/06/17/12-pro-tips-for-better-code-with-pouchdb.html
// https://pouchdb.com/2014/04/14/pagination-strategies-with-pouchdb.html
// https://pouchdb.com/2015/02/28/efficiently-managing-ui-state-in-pouchdb.html
// https://pouchdb.com/2014/05/01/secondary-indexes-have-landed-in-pouchdb.html

import { getDb, getDbFts, getSync } from "&/db";
import { sync } from "&/db/utils/syncDb";
import { getStore } from "&/store";
import { getWindow } from "&/window";
import { extractHashtags, parseContent } from "~/lib/markdown";
import type { InsertNote, Note } from "$/types/Note";
import type { Notebook } from "$/types/Notebook";
import dayjs from "dayjs";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { v4 as uuidv4 } from "uuid";

// Notes
export async function createNote(
  _: IpcMainInvokeEvent,
  insertNote: InsertNote,
): Promise<string> {
  const db = getDb();

  // if there are active tags then add \n and put the tags separated by spaces with #
  const tags = insertNote.tags.map((tag) => `#${tag}`).join(" ");

  let content = "";

  if (tags && tags.length > 0) {
    content = `\n${tags}\n`;
  }

  const note: Note = {
    _id: `note_${uuidv4()}`,
    _rev: undefined,
    type: "note",
    kind: "30023",
    filetype: "markdown",
    extension: "md",
    title: dayjs().format("YYYY-MM-DD"),
    content: content,
    previewContent: "",
    tags: insertNote.tags,
    notebookId: insertNote?.notebookId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: new Date().toISOString(),
    author: undefined,
    publishedAt: undefined,
    eventId: undefined,
    naddr: undefined,
    nevent: undefined,
    identifier: undefined,
    pinnedAt: undefined,
    trashedAt: undefined,
    archivedAt: undefined,
  };

  const response = await db.put<Note>(note);
  return response.id;
}

export async function getNote(_: IpcMainInvokeEvent, id: string) {
  const db = getDb();
  const response = await db.get<Note>(id);
  return response;
}

export async function getNoteFeed(
  _: IpcMainInvokeEvent,
  offset: number,
  limit: number,
  notebookId?: string,
  trashFeed = false,
  tags?: string[],
): Promise<Note[]> {
  const db = getDb();
  const sortSettings = getSortSettings();
  let sortField = sortSettings.sortBy;
  let sortOrder: "asc" | "desc";

  if (notebookId) {
    const notebook = await db.get<Notebook>(notebookId);
    sortField = notebook.sortBy;
    switch (notebook.sortBy) {
      case "createdAt":
        sortOrder = notebook.createdAtSortOrder;
        break;
      case "editedAt":
        sortOrder = notebook.editedAtSortOrder;
        break;
      case "title":
        sortOrder = notebook.titleSortOrder;
        break;
    }
  } else {
    switch (sortSettings.sortBy) {
      case "createdAt":
        sortOrder = sortSettings.createdAtSortOrder;
        break;
      case "editedAt":
        sortOrder = sortSettings.editedAtSortOrder;
        break;
      case "title":
        sortOrder = sortSettings.titleSortOrder;
        break;
    }
  }

  const selector: PouchDB.Find.Selector = {
    [sortField]: { $exists: true },
    type: "note",
    trashedAt: { $exists: trashFeed },
  };

  if (notebookId) {
    selector.notebookId = notebookId;
  }

  if (tags && tags.length > 0) {
    selector.tags = { $all: tags };
  }

  const response = await db.find({
    selector,
    sort: [{ [sortField]: sortOrder }],
    skip: offset,
    limit,
  });

  return response.docs as Note[];
}

export async function saveNote(_: IpcMainInvokeEvent, update: Partial<Note>) {
  const db = getDb();
  const id = update._id;
  if (!id) return;
  const note = await db.get<Note>(id);
  const tags = extractHashtags(update.content ?? "");
  note.tags = tags;
  note.title = update.title ?? dayjs().format("YYYY-MM-DD");
  note.content = update.content ?? "";
  note.previewContent = parseContent(update.content ?? "") ?? "";
  note.updatedAt = new Date().toISOString();
  note.editedAt = new Date().toISOString();
  const response = await db.put(note);
  return response.id;
}

export async function moveNoteToTrash(_: IpcMainEvent, id: string) {
  const db = getDb();
  const note = await db.get<Note>(id);
  note.trashedAt = new Date().toISOString();
  note.updatedAt = new Date().toISOString();
  const response = await db.put(note);
  return response.id;
}

export async function deleteNote(_: IpcMainEvent, id: string) {
  const db = getDb();
  const note = await db.get<Note>(id);
  note.title = "";
  note.content = "";
  note.previewContent = "";
  note.author = "";
  return await db.remove(note);
}

export async function restoreNote(_: IpcMainEvent, id: string) {
  const db = getDb();
  const note = await db.get<Note>(id);
  note.trashedAt = undefined;
  note.updatedAt = new Date().toISOString();
  note.editedAt = new Date().toISOString();
  const response = await db.put(note);
  return response.id;
}

export async function addPublishDetailsToNote(
  _: IpcMainInvokeEvent,
  update: Note,
) {
  const db = getDb();
  const id = update._id;
  if (!id) return;
  const note = await db.get<Note>(id);
  note.title = update.title ?? dayjs().format("YYYY-MM-DD");
  note.content = update.content ?? "";
  note.previewContent = parseContent(update.content ?? "") ?? "";
  note.updatedAt = new Date().toISOString();
  note.editedAt = new Date().toISOString();
  note.author = update.author;
  note.publishedAt = update.publishedAt;
  note.naddr = update.naddr;
  note.identifier = update.identifier;
  const response = await db.put(note);
  return response.id;
}

export async function moveNoteToNotebook(
  _: IpcMainInvokeEvent,
  noteId: string,
  notebookId: string | undefined,
) {
  const db = getDb();
  const note = await db.get<Note>(noteId);
  note.notebookId = notebookId;
  note.updatedAt = new Date().toISOString();
  const response = await db.put(note);
  return response.id;
}

// Notebooks
export async function createNotebook(_: IpcMainInvokeEvent, name: string) {
  const db = getDb();

  // look up the notebook by name
  const findResponse = await db.find({
    selector: {
      type: "notebook",
      name,
    },
  });

  if (findResponse.docs.length > 0) {
    throw new Error("Notebook with that name already exists");
  }

  const notebook = {
    _id: `notebook_${uuidv4()}`,
    type: "notebook",
    name,
    hidden: false,
    sortBy: "editedAt",
    createdAtSortOrder: "desc",
    editedAtSortOrder: "desc",
    titleSortOrder: "asc",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const response = await db.put(notebook);
  return response.id;
}

export async function getNotebook(_: IpcMainInvokeEvent, id: string) {
  const db = getDb();
  const response = await db.get<Notebook>(id);
  return response;
}

export async function getNotebooks(_: IpcMainInvokeEvent, showHidden = false) {
  const db = getDb();
  const selector: PouchDB.Find.Selector = {
    name: { $gt: null },
    type: "notebook",
    hidden: showHidden ? { $exists: true } : false,
  };

  const response = await db.find({
    selector,
    sort: [{ name: "asc" }],
  });

  // If you need to filter out null names, do it after the query
  const notebooks = response.docs as Notebook[];
  return notebooks;
}

export async function updateNotebook(
  _: IpcMainInvokeEvent,
  update: Partial<Notebook>,
) {
  const db = getDb();
  const id = update._id;
  if (!id) return;
  const notebook = await db.get<Notebook>(id);
  const updatedNotebook = { ...notebook, ...update };
  updatedNotebook.updatedAt = new Date().toISOString();
  const response = await db.put(updatedNotebook);
  return response.id;
}

export async function hideNotebook(event: IpcMainInvokeEvent, id: string) {
  const db = getDb();
  const notebook = await db.get<Notebook>(id);
  notebook.hidden = true;
  notebook.updatedAt = new Date().toISOString();
  const response = await db.put(notebook);
  event.sender.send("notebookHidden", id);
  return response.id;
}

export async function unhideNotebook(_: IpcMainInvokeEvent, id: string) {
  const db = getDb();
  const notebook = await db.get<Notebook>(id);
  notebook.hidden = false;
  notebook.updatedAt = new Date().toISOString();
  const response = await db.put(notebook);
  return response.id;
}

export async function deleteNotebook(event: IpcMainInvokeEvent, id: string) {
  const db = getDb();
  const notebook = await db.get<Notebook>(id);
  const notesResponse = await db.find({
    selector: {
      type: "note",
      notebookId: id,
    },
  });

  for (const note of notesResponse.docs) {
    (note as Note).notebookId = undefined;
    await db.put(note as Note);
  }

  notebook.name = "";
  await db.remove(notebook);
  event.sender.send("notebookDeleted", id);
  return id;
}

export async function getAllTags() {
  const db = getDb();
  try {
    // Query the 'allTags' view with grouping to get unique tags
    const result = await db.query("tags/allTags", {
      group: true,
    });

    // Extract the unique tags from the result rows
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const uniqueTags = result.rows.map((row) => row.key) as string[];

    // TODO: we can probably return the count too with row.value
    return uniqueTags;
  } catch (err) {
    console.error("Error getting all tags:", err);
    throw err; // Re-throw the error for the caller to handle
  }
}

export async function getTagsByNotebookId(
  _: IpcMainInvokeEvent,
  notebookId: string,
) {
  const db = getDb();
  const result = await db.query("tags/tagsByNotebook", {
    startkey: [notebookId],
    endkey: [notebookId, {}],
    group: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return result.rows.map((row) => row.key[1]);
}

// TODO: add notebook id to fts as well
export async function searchNotes(
  _: IpcMainInvokeEvent,
  searchTerm: string,
  limit: number,
  offset: number,
  trashed: boolean, // Add parameter with default value false
  notebookId?: string,
): Promise<Note[]> {
  const db = getDb();
  const dbFts = getDbFts();

  // Return empty array if search term is empty or just whitespace
  if (!searchTerm.trim()) {
    return [];
  }

  const literalQuery = `%${searchTerm.trim()}%`;

  let selectQuery: string;
  let selectParams: unknown[];

  // Add trashedAt condition based on the trashed parameter
  const trashedCondition = trashed
    ? "trashedAt IS NOT NULL"
    : "trashedAt IS NULL";

  if (notebookId) {
    selectQuery = `SELECT doc_id FROM notes WHERE content LIKE ? AND notebookId = ? AND ${trashedCondition} ORDER BY editedAt DESC LIMIT ? OFFSET ?`;
    selectParams = [literalQuery, notebookId, limit, offset];
  } else {
    selectQuery = `SELECT doc_id FROM notes WHERE content LIKE ? AND ${trashedCondition} ORDER BY editedAt DESC LIMIT ? OFFSET ?`;
    selectParams = [literalQuery, limit, offset];
  }

  type Row = {
    doc_id: string;
  };

  try {
    const rows = (await new Promise<unknown[]>((resolve, reject) => {
      dbFts.all(selectQuery, selectParams, (err, rows) => {
        if (err) {
          console.error("Error searching notes table:", err);
          reject(err);
          return;
        }
        resolve(rows);
      });
    })) as Row[];

    const docIds = rows.map((row: Row) => row.doc_id);

    // Fetch full documents from PouchDB using the doc_ids
    const pouchDbResult = await db.allDocs({
      keys: docIds,
      include_docs: true,
    });

    const pouchDbRows = pouchDbResult.rows;

    // Filter out any missing documents and map to Note type
    const notes = pouchDbRows
      .filter((row) => "doc" in row && row.doc) // Ensure doc exists
      .map((row) => {
        if ("doc" in row && row.doc) {
          return row.doc as Note;
        }
        return null;
      })
      .filter((note): note is Note => note !== null);

    return notes;
  } catch (err) {
    console.error("Error fetching documents from PouchDB:", err);
    throw err;
  }
}

export function syncDb(
  _: IpcMainInvokeEvent,
  remoteUrl: string,
  // syncMethod: "comet_sync" | "custom_sync",
) {
  sync(remoteUrl);
  const store = getStore();
  store.set({
    sync: {
      remote: {
        url: remoteUrl,
      },
      method: "custom_sync",
    },
  });
}

export function cancelSync() {
  const sync = getSync();
  const store = getStore();
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

export function getSyncConfig() {
  const store = getStore();
  return store.get("sync") as
    | {
        remote: {
          url: string | undefined;
        };
        method: "no_sync" | "custom_sync";
      }
    | undefined;
}

export function getSortSettings() {
  const store = getStore();
  return {
    sortBy: store.get("sortBy"),
    createdAtSortOrder: store.get("createdAtSortOrder"),
    editedAtSortOrder: store.get("editedAtSortOrder"),
    titleSortOrder: store.get("titleSortOrder"),
  };
}

export function updateSortSettings(
  event: IpcMainInvokeEvent,
  sortBy: "createdAt" | "editedAt" | "title",
  sortOrder: "asc" | "desc",
) {
  const store = getStore();
  store.set("sortBy", sortBy);
  switch (sortBy) {
    case "createdAt":
      store.set("createdAtSortOrder", sortOrder);
      break;
    case "editedAt":
      store.set("editedAtSortOrder", sortOrder);
      break;
    case "title":
      store.set("titleSortOrder", sortOrder);
      break;
  }
  event.sender.send("sortSettingsUpdated", { sortBy, sortOrder });
}

export function toggleMaximize(_: IpcMainInvokeEvent) {
  const mainWindow = getWindow();
  console.log("mainWindow", mainWindow);
  console.log("isMaximized", mainWindow.isMaximized());
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
}
