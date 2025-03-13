// https://pouchdb.com/
// https://pouchdb.com/api.html
// https://pouchdb.com/2014/06/17/12-pro-tips-for-better-code-with-pouchdb.html
// https://pouchdb.com/2014/04/14/pagination-strategies-with-pouchdb.html
// https://pouchdb.com/2015/02/28/efficiently-managing-ui-state-in-pouchdb.html
// https://pouchdb.com/2014/05/01/secondary-indexes-have-landed-in-pouchdb.html

import { type InsertNote, type Note } from "$/types/Note";
import { type Notebook } from "$/types/Notebook";
import dayjs from "dayjs";
import { type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { v4 as uuidv4 } from "uuid";

import { getDb } from "../db";

// Notes
export async function createNote(
  _: IpcMainInvokeEvent,
  insertNote: InsertNote,
): Promise<string> {
  const db = getDb();
  const note: Note = {
    _id: `note_${uuidv4()}`,
    _rev: undefined,
    type: "note",
    title: dayjs().format("YYYY-MM-DD"),
    content: "",
    notebookId: insertNote?.notebookId,
    createdAt: new Date(),
    updatedAt: new Date(),
    contentUpdatedAt: new Date(),
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
) {
  const db = getDb();

  const selector: PouchDB.Find.Selector = {
    contentUpdatedAt: { $exists: true },
    type: "note",
    trashedAt: { $exists: trashFeed },
  };

  if (notebookId) {
    selector.notebookId = notebookId;
  }

  const response = await db.find({
    selector,
    sort: [{ [sortField]: sortOrder }],
    skip: offset,
    limit,
  });

  const notes = response.docs as Note[];

  return notes;
}

export async function saveNote(_: IpcMainInvokeEvent, update: Partial<Note>) {
  const db = getDb();
  const id = update._id;
  if (!id) return;
  const note = await db.get<Note>(id);
  note.title = update.title ?? dayjs().format("YYYY-MM-DD");
  note.content = update.content ?? "";
  note.updatedAt = new Date();
  note.contentUpdatedAt = new Date();
  const response = await db.put(note);
  return response.id;
}

export async function moveNoteToTrash(_: IpcMainEvent, id: string) {
  const db = getDb();
  const note = await db.get<Note>(id);
  note.trashedAt = new Date();
  note.updatedAt = new Date();
  const response = await db.put(note);
  return response.id;
}

export async function deleteNote(_: IpcMainEvent, id: string) {
  const db = getDb();
  const note = await db.get<Note>(id);
  note.title = "";
  note.content = "";
  note.author = "";
  return await db.remove(note);
}

export async function restoreNote(_: IpcMainEvent, id: string) {
  const db = getDb();
  const note = await db.get<Note>(id);
  note.trashedAt = undefined;
  note.updatedAt = new Date();
  note.contentUpdatedAt = new Date();
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
  note.updatedAt = new Date();
  note.contentUpdatedAt = new Date();
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
    createdAt: new Date(),
    updatedAt: new Date(),
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
  notebook.updatedAt = new Date();
  const response = await db.put(notebook);
  return response.id;
}

export async function hideNotebook(event: IpcMainInvokeEvent, id: string) {
  const db = getDb();
  const notebook = await db.get<Notebook>(id);
  notebook.hidden = true;
  notebook.updatedAt = new Date();
  const response = await db.put(notebook);
  event.sender.send("notebookHidden", id);
  return response.id;
}

export async function unhideNotebook(_: IpcMainInvokeEvent, id: string) {
  const db = getDb();
  const notebook = await db.get<Notebook>(id);
  notebook.hidden = false;
  notebook.updatedAt = new Date();
  const response = await db.put(notebook);
  return response.id;
}

export async function deleteNotebook(event: IpcMainInvokeEvent, id: string) {
  const db = getDb();
  const notebook = await db.get<Notebook>(id);
  notebook.name = "";
  await db.remove(notebook);
  event.sender.send("notebookDeleted", id);
  return id;
}
