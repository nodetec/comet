// https://pouchdb.com/
// https://pouchdb.com/api.html
// https://pouchdb.com/2014/06/17/12-pro-tips-for-better-code-with-pouchdb.html
// https://pouchdb.com/2014/04/14/pagination-strategies-with-pouchdb.html
// https://pouchdb.com/2015/02/28/efficiently-managing-ui-state-in-pouchdb.html
// https://pouchdb.com/2014/05/01/secondary-indexes-have-landed-in-pouchdb.html

import { getDb, getDbFts } from "&/db";
import { extractHashtags, parseContent } from "~/lib/markdown";
import { type InsertNote, type Note } from "$/types/Note";
import { type Notebook } from "$/types/Notebook";
import dayjs from "dayjs";
import { type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
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
    title: dayjs().format("YYYY-MM-DD"),
    content: content,
    previewContent: "",
    tags: insertNote.tags,
    notebookId: insertNote?.notebookId,
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
  sortField: "title" | "createdAt" | "contentUpdatedAt" = "contentUpdatedAt",
  sortOrder: "asc" | "desc" = "desc",
  notebookId?: string,
  trashFeed = false,
  tags?: string[],
): Promise<Note[]> {
  const db = getDb();

  const selector: PouchDB.Find.Selector = {
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
  note.contentUpdatedAt = new Date().toISOString();
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
  note.contentUpdatedAt = new Date().toISOString();
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
  note.contentUpdatedAt = new Date().toISOString();
  note.author = update.author;
  note.publishedAt = update.publishedAt;
  note.eventAddress = update.eventAddress;
  note.identifier = update.identifier;
  const response = await db.put(note);
  return response.id;
}

export async function moveNoteToNotebook(
  _: IpcMainInvokeEvent,
  noteId: string,
  notebookId: string,
) {
  const db = getDb();
  const note = await db.get<Note>(noteId);
  note.notebookId = notebookId;
  note.updatedAt = new Date().toISOString();
  note.contentUpdatedAt = new Date().toISOString();
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

export async function updateNotebookName(
  _: IpcMainInvokeEvent,
  update: Partial<Notebook>,
) {
  const db = getDb();
  const id = update._id;
  if (!id) return;
  const notebook = await db.get<Notebook>(id);
  notebook.name = update.name ?? "";
  notebook.updatedAt = new Date().toISOString();
  const response = await db.put(notebook);
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
  notebookId?: string,
): Promise<Note[]> {
  const db = getDb();
  const dbFts = getDbFts();

  console.log("searching for", searchTerm);

  // Return empty array if search term is empty or just whitespace
  if (!searchTerm.trim()) {
    return [];
  }

  const literalQuery = "%" + searchTerm.trim() + "%";

  console.log("query", literalQuery);

  let selectQuery;
  let selectParams;

  if (notebookId) {
    selectQuery =
      "SELECT doc_id FROM notes_fts WHERE content LIKE ? AND notebookId = ? ORDER BY contentUpdatedAt DESC LIMIT ? OFFSET ?";
    selectParams = [literalQuery, notebookId, limit, offset];
  } else {
    selectQuery =
      "SELECT doc_id FROM notes_fts WHERE content LIKE ? ORDER BY contentUpdatedAt DESC LIMIT ? OFFSET ?";
    selectParams = [literalQuery, limit, offset];
  }

  // maybe we can use the FTS5 MATCH query instead of LIKE later on to take advantage of the FTS index
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      dbFts.all(selectQuery, selectParams, (err, rows) => {
        if (err) {
          console.error("Error searching FTS index:", err);
          reject(err);
          return;
        }
        resolve(rows);
      });
    });

    // Extract doc_ids from the FTS query results
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const docIds = rows.map((row: unknown) => row.doc_id);

    // Fetch full documents from PouchDB using the doc_ids
    const result = await db.allDocs({
      keys: docIds,
      include_docs: true,
    });

    // Filter out any missing documents and map to Note type
    const notes = result.rows
      .filter((row) => row.doc) // Ensure doc exists
      .map((row) => row.doc as Note);

    console.log("notes", notes);

    return notes;
  } catch (err) {
    console.error("Error fetching documents from PouchDB:", err);
    throw err;
  }
}
