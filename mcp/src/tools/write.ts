import type { DB } from "../db";
import { extractTags, titleFromMarkdown } from "../lib/markdown";
import type { LoadedNote, NotebookSummary } from "../lib/types";
import { readNote } from "./read";

function nowMillis(): number {
  return Date.now();
}

function validateNoteId(noteId: string): void {
  if (
    noteId.length === 0 ||
    noteId.includes("/") ||
    noteId.includes("\\") ||
    noteId.includes("..")
  ) {
    throw new Error("Invalid note id.");
  }
}

function validateNotebookId(notebookId: string): void {
  if (
    notebookId.length === 0 ||
    notebookId.includes("/") ||
    notebookId.includes("\\") ||
    notebookId.includes("..")
  ) {
    throw new Error("Invalid notebook id.");
  }
}

function normalizeNotebookName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Notebook name cannot be empty.");
  }
  if (trimmed.length > 80) {
    throw new Error("Notebook name is too long.");
  }
  return trimmed;
}

function upsertNoteSearchDocument(
  db: DB,
  noteId: string,
  title: string,
  markdown: string,
): void {
  db.prepare("DELETE FROM notes_fts WHERE note_id = ?").run(noteId);
  db.prepare(
    "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?, ?, ?)",
  ).run(noteId, title, markdown);
}

function replaceNoteTags(db: DB, noteId: string, markdown: string): void {
  const nextTags = extractTags(markdown);
  const currentRows = db
    .prepare("SELECT tag FROM note_tags WHERE note_id = ? ORDER BY tag ASC")
    .all(noteId) as { tag: string }[];
  const currentTags = currentRows.map((r) => r.tag);

  if (
    currentTags.length === nextTags.length &&
    currentTags.every((t, i) => t === nextTags[i])
  ) {
    return;
  }

  // Linear diff of sorted arrays
  let ci = 0;
  let ni = 0;
  const deleteStmt = db.prepare(
    "DELETE FROM note_tags WHERE note_id = ? AND tag = ?",
  );
  const insertStmt = db.prepare(
    "INSERT INTO note_tags (note_id, tag) VALUES (?, ?)",
  );

  while (ci < currentTags.length && ni < nextTags.length) {
    if (currentTags[ci] < nextTags[ni]) {
      deleteStmt.run(noteId, currentTags[ci]);
      ci++;
    } else if (currentTags[ci] > nextTags[ni]) {
      insertStmt.run(noteId, nextTags[ni]);
      ni++;
    } else {
      ci++;
      ni++;
    }
  }
  while (ci < currentTags.length) {
    deleteStmt.run(noteId, currentTags[ci]);
    ci++;
  }
  while (ni < nextTags.length) {
    insertStmt.run(noteId, nextTags[ni]);
    ni++;
  }
}

export function createNote(
  db: DB,
  input: {
    markdown?: string;
    notebookId?: string;
  },
): LoadedNote {
  const noteId = `note-${nowMillis()}`;
  const markdown = input.markdown ?? "# ";
  const title = titleFromMarkdown(markdown);
  const now = nowMillis();

  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO notes (id, title, markdown, notebook_id, created_at, modified_at, edited_at, locally_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(noteId, title, markdown, input.notebookId ?? null, now, now, now);
    upsertNoteSearchDocument(db, noteId, title, markdown);
    replaceNoteTags(db, noteId, markdown);
  });
  transaction();

  const note = readNote(db, noteId);
  if (!note) {
    throw new Error("Failed to create note.");
  }
  return note;
}

export function updateNote(
  db: DB,
  input: {
    noteId: string;
    markdown: string;
  },
): LoadedNote {
  validateNoteId(input.noteId);
  const title = titleFromMarkdown(input.markdown);

  const transaction = db.transaction(() => {
    const existing = db
      .prepare("SELECT markdown FROM notes WHERE id = ?")
      .get(input.noteId) as { markdown: string } | null;

    if (!existing) {
      throw new Error("Note not found.");
    }

    const contentChanged = existing.markdown !== input.markdown;
    if (contentChanged) {
      const now = nowMillis();
      db.prepare(
        "UPDATE notes SET title = ?, markdown = ?, modified_at = ?, edited_at = ?, locally_modified = 1 WHERE id = ?",
      ).run(title, input.markdown, now, now, input.noteId);
    } else {
      db.prepare("UPDATE notes SET title = ?, markdown = ? WHERE id = ?").run(
        title,
        input.markdown,
        input.noteId,
      );
    }

    upsertNoteSearchDocument(db, input.noteId, title, input.markdown);
    replaceNoteTags(db, input.noteId, input.markdown);
  });
  transaction();

  const note = readNote(db, input.noteId);
  if (!note) {
    throw new Error("Note not found.");
  }
  return note;
}

export function createNotebook(db: DB, name: string): NotebookSummary {
  const notebookId = `notebook-${nowMillis()}`;
  const normalized = normalizeNotebookName(name);
  const now = nowMillis();

  try {
    db.prepare(
      `INSERT INTO notebooks (id, name, created_at, updated_at, locally_modified)
       VALUES (?, ?, ?, ?, 1)`,
    ).run(notebookId, normalized, now, now);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      throw new Error("A notebook with that name already exists.", {
        cause: error,
      });
    }
    throw error;
  }

  return { id: notebookId, name: normalized, noteCount: 0 };
}

export function archiveNote(db: DB, noteId: string): LoadedNote {
  validateNoteId(noteId);
  const now = nowMillis();
  const updated = db
    .prepare(
      "UPDATE notes SET archived_at = ?, modified_at = ?, locally_modified = 1 WHERE id = ? AND archived_at IS NULL",
    )
    .run(now, now, noteId);

  if (updated.changes === 0) {
    throw new Error("Note not found or already archived.");
  }

  const note = readNote(db, noteId);
  if (!note) {
    throw new Error("Note not found.");
  }
  return note;
}

export function restoreNote(db: DB, noteId: string): LoadedNote {
  validateNoteId(noteId);
  const now = nowMillis();
  const updated = db
    .prepare(
      "UPDATE notes SET archived_at = NULL, modified_at = ?, locally_modified = 1 WHERE id = ? AND archived_at IS NOT NULL",
    )
    .run(now, noteId);

  if (updated.changes === 0) {
    throw new Error("Note not found or not archived.");
  }

  const note = readNote(db, noteId);
  if (!note) {
    throw new Error("Note not found.");
  }
  return note;
}

export function trashNote(db: DB, noteId: string): LoadedNote {
  validateNoteId(noteId);
  const now = nowMillis();
  const updated = db
    .prepare(
      "UPDATE notes SET deleted_at = ?, modified_at = ?, locally_modified = 1 WHERE id = ? AND deleted_at IS NULL",
    )
    .run(now, now, noteId);

  if (updated.changes === 0) {
    throw new Error("Note not found or already trashed.");
  }

  const note = readNote(db, noteId);
  if (!note) {
    throw new Error("Note not found.");
  }
  return note;
}

export function restoreFromTrash(db: DB, noteId: string): LoadedNote {
  validateNoteId(noteId);
  const now = nowMillis();
  const updated = db
    .prepare(
      "UPDATE notes SET deleted_at = NULL, modified_at = ?, locally_modified = 1 WHERE id = ? AND deleted_at IS NOT NULL",
    )
    .run(now, noteId);

  if (updated.changes === 0) {
    throw new Error("Note not found or not in trash.");
  }

  const note = readNote(db, noteId);
  if (!note) {
    throw new Error("Note not found.");
  }
  return note;
}

export function pinNote(db: DB, noteId: string): LoadedNote {
  validateNoteId(noteId);
  const now = nowMillis();
  const updated = db
    .prepare(
      "UPDATE notes SET pinned_at = ?, modified_at = ?, locally_modified = 1 WHERE id = ?",
    )
    .run(now, now, noteId);

  if (updated.changes === 0) {
    throw new Error("Note not found.");
  }

  const note = readNote(db, noteId);
  if (!note) {
    throw new Error("Note not found.");
  }
  return note;
}

export function unpinNote(db: DB, noteId: string): LoadedNote {
  validateNoteId(noteId);
  const now = nowMillis();
  const updated = db
    .prepare(
      "UPDATE notes SET pinned_at = NULL, modified_at = ?, locally_modified = 1 WHERE id = ?",
    )
    .run(now, noteId);

  if (updated.changes === 0) {
    throw new Error("Note not found.");
  }

  const note = readNote(db, noteId);
  if (!note) {
    throw new Error("Note not found.");
  }
  return note;
}

export function assignNotebook(
  db: DB,
  noteId: string,
  notebookId: string | null,
): LoadedNote {
  validateNoteId(noteId);
  if (notebookId) {
    validateNotebookId(notebookId);
  }
  if (notebookId) {
    const exists = db
      .prepare("SELECT 1 FROM notebooks WHERE id = ? LIMIT 1")
      .get(notebookId);
    if (!exists) {
      throw new Error("Notebook not found.");
    }
  }

  const now = nowMillis();
  const updated = db
    .prepare(
      "UPDATE notes SET notebook_id = ?, modified_at = ?, locally_modified = 1 WHERE id = ?",
    )
    .run(notebookId, now, noteId);

  if (updated.changes === 0) {
    throw new Error("Note not found.");
  }

  const note = readNote(db, noteId);
  if (!note) {
    throw new Error("Note not found.");
  }
  return note;
}
