use crate::domain::common::text::extract_tags;
use crate::domain::sync::model::SyncedNote;
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
    let parsed_direct_tags = extract_tags(&note.markdown);
    if !note.tags.is_empty() && note.tags != parsed_direct_tags {
        eprintln!(
            "[sync] direct tag mismatch for note={} payload_tags={:?} parsed_tags={:?}",
            note.id, note.tags, parsed_direct_tags
        );
    }

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

    if existing.is_some() {
        // Update existing note
        conn.execute(
            "UPDATE notes SET title = ?1, markdown = ?2, modified_at = ?3, edited_at = ?4, \
             archived_at = ?5, deleted_at = ?6, pinned_at = ?7, readonly = ?8, sync_event_id = ?9, locally_modified = 0 WHERE id = ?10",
            params![
                note.title,
                note.markdown,
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
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, \
             archived_at, deleted_at, pinned_at, readonly, sync_event_id, locally_modified) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0)",
            params![
                note.id,
                note.title,
                note.markdown,
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
    crate::adapters::sqlite::tag_index::rebuild_note_tag_index(conn, &note.id, &note.markdown)?;

    // Update FTS
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note.id])?;
    conn.execute(
        "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
        params![note.id, note.title, note.markdown],
    )?;

    Ok(Some(note.id.clone()))
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;
    use crate::domain::sync::model::SyncedNote;
    use rusqlite::{params, Connection};

    fn setup_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        conn
    }

    fn make_synced_note(id: &str, modified_at: i64) -> SyncedNote {
        SyncedNote {
            id: id.to_string(),
            title: format!("Title {id}"),
            markdown: format!("# Title {id}\n\nBody"),
            created_at: 1000,
            modified_at,
            edited_at: modified_at,
            archived_at: None,
            deleted_at: None,
            pinned_at: None,
            readonly: false,
            tags: vec![],
        }
    }

    #[test]
    fn upsert_inserts_new_note() {
        let conn = setup_db();
        let note = make_synced_note("note-1", 2000);

        let result = upsert_from_sync(&conn, &note, "evt-1").unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Title note-1");
    }

    #[test]
    fn upsert_updates_when_remote_is_newer() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["note-1", "Old Title", "Old body", 1000, 2000, 2000],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Old Title", "Old body"],
        )
        .unwrap();

        let note = make_synced_note("note-1", 3000);
        let result = upsert_from_sync(&conn, &note, "evt-2").unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Title note-1");
    }

    #[test]
    fn upsert_skips_when_local_is_newer() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["note-1", "Local Title", "Local body", 1000, 5000, 5000],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Local Title", "Local body"],
        )
        .unwrap();

        let note = make_synced_note("note-1", 3000);
        let result = upsert_from_sync(&conn, &note, "evt-3").unwrap();
        assert_eq!(result, None);

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Local Title");
    }

    #[test]
    fn delete_note_removes_note_and_fts() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["note-1", "Title", "Body", 1000, 2000, 2000],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Title", "Body"],
        )
        .unwrap();

        let mut invalidated: Option<String> = None;
        delete_note_from_sync(&conn, "note-1", |id| {
            invalidated = Some(id.to_string());
        })
        .unwrap();

        let notes_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        let fts_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes_fts", [], |row| row.get(0))
            .unwrap();

        assert_eq!(notes_count, 0);
        assert_eq!(fts_count, 0);
        assert_eq!(invalidated.as_deref(), Some("note-1"));
    }
}
