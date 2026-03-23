use crate::domain::sync::model::{SyncedNote, SyncedNotebook};
use crate::domain::common::time::now_millis;
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};

pub fn delete_note_from_sync(
    conn: &Connection,
    note_id: &str,
    mut invalidate_cache: impl FnMut(&str),
) -> Result<(), AppError> {
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
    conn.execute("DELETE FROM notes WHERE id = ?1", params![note_id])?;
    invalidate_cache(note_id);
    Ok(())
}

pub fn upsert_from_sync(
    conn: &Connection,
    note: &SyncedNote,
    sync_event_id: &str,
) -> Result<Option<String>, AppError> {
    let existing: Option<(String, i64)> = conn
        .query_row(
            "SELECT id, modified_at FROM notes WHERE id = ?1",
            params![note.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    if let Some((_, local_modified)) = &existing {
        if *local_modified >= note.modified_at {
            eprintln!(
                "[sync] skip upsert note={} local_modified={} remote_modified={}",
                note.id, local_modified, note.modified_at
            );
            // Local version is same or newer — just update sync_event_id
            conn.execute(
                "UPDATE notes SET sync_event_id = ?1 WHERE id = ?2",
                params![sync_event_id, note.id],
            )?;
            return Ok(None);
        }
    }

    // Ensure referenced notebook exists (it may arrive after the note in the sync stream).
    // Stub gets updated_at = 0 so the real notebook event always wins LWW.
    if let Some(ref nb_id) = note.notebook_id {
        let now = now_millis();
        conn.execute(
            "INSERT OR IGNORE INTO notebooks (id, name, created_at, updated_at, locally_modified) VALUES (?1, ?1, ?2, 0, 0)",
            params![nb_id, now],
        )?;
    }

    if existing.is_some() {
        // Update existing note
        conn.execute(
            "UPDATE notes SET title = ?1, markdown = ?2, notebook_id = ?3, modified_at = ?4, edited_at = ?5, \
             archived_at = ?6, deleted_at = ?7, pinned_at = ?8, readonly = ?9, sync_event_id = ?10, locally_modified = 0 WHERE id = ?11",
            params![
                note.title,
                note.markdown,
                note.notebook_id,
                note.modified_at,
                note.edited_at,
                note.archived_at,
                note.deleted_at,
                note.pinned_at,
                i32::from(note.readonly),
                sync_event_id,
                note.id,
            ],
        )?;
    } else {
        // Insert new note
        conn.execute(
            "INSERT INTO notes (id, title, markdown, notebook_id, created_at, modified_at, edited_at, \
             archived_at, deleted_at, pinned_at, readonly, sync_event_id, locally_modified) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0)",
            params![
                note.id,
                note.title,
                note.markdown,
                note.notebook_id,
                note.created_at,
                note.modified_at,
                note.edited_at,
                note.archived_at,
                note.deleted_at,
                note.pinned_at,
                i32::from(note.readonly),
                sync_event_id,
            ],
        )?;
    }

    // Update tags
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", params![note.id])?;
    for tag in &note.tags {
        conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?1, ?2)",
            params![note.id, tag],
        )?;
    }

    // Update FTS
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note.id])?;
    conn.execute(
        "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
        params![note.id, note.title, note.markdown],
    )?;

    Ok(Some(note.id.clone()))
}

pub fn upsert_notebook_from_sync(
    conn: &Connection,
    notebook: &SyncedNotebook,
    sync_event_id: &str,
) -> Result<(), AppError> {
    let existing: Option<i64> = conn
        .query_row(
            "SELECT updated_at FROM notebooks WHERE id = ?1",
            params![notebook.id],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(local_updated) = existing {
        if local_updated >= notebook.updated_at {
            // Local version is same or newer — just update sync_event_id
            conn.execute(
                "UPDATE notebooks SET sync_event_id = ?1 WHERE id = ?2",
                params![sync_event_id, notebook.id],
            )?;
            return Ok(());
        }
        conn.execute(
            "UPDATE notebooks SET name = ?1, updated_at = ?2, sync_event_id = ?3, locally_modified = 0 WHERE id = ?4",
            params![notebook.name, notebook.updated_at, sync_event_id, notebook.id],
        )?;
    } else {
        conn.execute(
            "INSERT INTO notebooks (id, name, created_at, updated_at, sync_event_id, locally_modified) \
             VALUES (?1, ?2, ?3, ?3, ?4, 0)",
            params![notebook.id, notebook.name, notebook.updated_at, sync_event_id],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::delete_note_from_sync;
    use rusqlite::{params, Connection};

    #[test]
    fn sync_delete_removes_note_and_invalidates_cache() {
        let conn = Connection::open_in_memory().expect("open sqlite");
        conn.execute_batch(
            "CREATE TABLE notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                markdown TEXT NOT NULL
            );
            CREATE TABLE notes_fts (
                note_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                markdown TEXT NOT NULL
            );",
        )
        .expect("create schema");
        conn.execute(
            "INSERT INTO notes (id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Title", "Body"],
        )
        .expect("insert note");
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Title", "Body"],
        )
        .expect("insert fts");

        let mut invalidated_note_id: Option<String> = None;
        delete_note_from_sync(&conn, "note-1", |note_id| {
            invalidated_note_id = Some(note_id.to_string());
        })
        .expect("delete note from sync");

        let notes_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("count notes");
        let fts_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes_fts", [], |row| row.get(0))
            .expect("count notes_fts");

        assert_eq!(notes_count, 0);
        assert_eq!(fts_count, 0);
        assert_eq!(invalidated_note_id.as_deref(), Some("note-1"));
    }
}
