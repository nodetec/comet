use crate::domain::common::text::extract_tags;
use crate::domain::sync::model::{SyncedNote, SyncedTombstone};
use crate::domain::sync::vector_clock::{
    compare_vector_clocks, increment_vector_clock, parse_vector_clock, serialize_vector_clock,
    VectorClock, VectorClockComparison,
};
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

type ExistingSyncedNote = (
    String,
    bool,
    String,
    String,
    i64,
    i64,
    Option<i64>,
    Option<i64>,
    bool,
    String,
);

type ExistingTombstone = (String, i64, String, Option<String>);

const DEVICE_ID_KEY: &str = "sync_device_id";

fn snapshot_content_matches(note: &SyncedNote, existing: &ExistingSyncedNote) -> bool {
    existing.2 == note.markdown
        && existing.3 == note.device_id
        && existing.4 == note.created_at
        && existing.5 == note.edited_at
        && existing.6 == note.archived_at
        && existing.7 == note.pinned_at
        && existing.8 == note.readonly
}

fn current_device_id(conn: &Connection) -> Result<String, AppError> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![DEVICE_ID_KEY],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(device_id) = existing {
        if !device_id.trim().is_empty() {
            return Ok(device_id);
        }
    }

    let device_id = Uuid::new_v4().hyphenated().to_string().to_uppercase();
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![DEVICE_ID_KEY, device_id],
    )?;
    Ok(device_id)
}

fn load_existing_tombstone(
    conn: &Connection,
    note_id: &str,
) -> Result<Option<ExistingTombstone>, AppError> {
    conn.query_row(
        "SELECT last_edit_device_id, deleted_at, vector_clock
         , sync_event_id
         FROM note_tombstones
         WHERE id = ?1",
        params![note_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()
    .map_err(Into::into)
}

fn clear_note_materialization(conn: &Connection, note_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM note_tag_links WHERE note_id = ?1",
        params![note_id],
    )?;
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
    conn.execute("DELETE FROM notes WHERE id = ?1", params![note_id])?;
    Ok(())
}

fn store_note_conflict(
    conn: &Connection,
    note: &SyncedNote,
    sync_event_id: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO note_conflicts
           (sync_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
         VALUES (?1, ?2, 'put', ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, ?10, ?11, ?12)
         ON CONFLICT(sync_event_id) DO UPDATE SET
           op = excluded.op,
           device_id = excluded.device_id,
           vector_clock = excluded.vector_clock,
           title = excluded.title,
           markdown = excluded.markdown,
           modified_at = excluded.modified_at,
           edited_at = excluded.edited_at,
           deleted_at = excluded.deleted_at,
           archived_at = excluded.archived_at,
           pinned_at = excluded.pinned_at,
           readonly = excluded.readonly,
           created_at = excluded.created_at",
        params![
            sync_event_id,
            note.id,
            note.device_id,
            serialize_vector_clock(&note.vector_clock).map_err(AppError::custom)?,
            note.title,
            note.markdown,
            note.modified_at,
            note.edited_at,
            note.archived_at,
            note.pinned_at,
            i32::from(note.readonly),
            note.created_at,
        ],
    )?;
    Ok(())
}

fn store_tombstone_conflict(
    conn: &Connection,
    tombstone: &SyncedTombstone,
    snapshot_id: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO note_conflicts
           (sync_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
         VALUES (?1, ?2, 'del', ?3, ?4, NULL, NULL, ?5, NULL, ?6, NULL, NULL, 0, ?7)
         ON CONFLICT(sync_event_id) DO UPDATE SET
           op = excluded.op,
           device_id = excluded.device_id,
           vector_clock = excluded.vector_clock,
           title = excluded.title,
           markdown = excluded.markdown,
           modified_at = excluded.modified_at,
           edited_at = excluded.edited_at,
           deleted_at = excluded.deleted_at,
           archived_at = excluded.archived_at,
           pinned_at = excluded.pinned_at,
           readonly = excluded.readonly,
           created_at = excluded.created_at",
        params![
            snapshot_id,
            tombstone.id,
            tombstone.device_id,
            serialize_vector_clock(&tombstone.vector_clock).map_err(AppError::custom)?,
            tombstone.deleted_at,
            tombstone.deleted_at,
            tombstone.deleted_at,
        ],
    )?;
    Ok(())
}

fn clear_note_tombstone_state(conn: &Connection, note_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM note_tombstones WHERE id = ?1",
        params![note_id],
    )?;
    conn.execute(
        "DELETE FROM pending_deletions WHERE entity_id = ?1",
        params![note_id],
    )?;
    Ok(())
}

pub fn clear_note_conflicts(conn: &Connection, note_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM note_conflicts WHERE note_id = ?1",
        params![note_id],
    )?;
    Ok(())
}

pub fn tombstone_note_locally(
    conn: &Connection,
    note_id: &str,
    deleted_at: i64,
) -> Result<bool, AppError> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT COALESCE(vector_clock, '{}')
             FROM notes
             WHERE id = ?1",
            params![note_id],
            |row| row.get(0),
        )
        .optional()?;

    let Some(vector_clock_json) = existing else {
        return Ok(false);
    };

    let device_id = current_device_id(conn)?;
    let current_clock = parse_vector_clock(&vector_clock_json).map_err(AppError::custom)?;
    let next_clock =
        increment_vector_clock(&current_clock, &device_id).map_err(AppError::custom)?;
    let next_clock_json = serialize_vector_clock(&next_clock).map_err(AppError::custom)?;

    clear_note_materialization(conn, note_id)?;
    clear_note_conflicts(conn, note_id)?;
    conn.execute(
        "INSERT INTO note_tombstones
           (id, deleted_at, last_edit_device_id, vector_clock, locally_modified)
         VALUES (?1, ?2, ?3, ?4, 1)
         ON CONFLICT(id) DO UPDATE SET
           deleted_at = excluded.deleted_at,
           last_edit_device_id = excluded.last_edit_device_id,
           vector_clock = excluded.vector_clock,
           locally_modified = 1,
           sync_event_id = NULL",
        params![note_id, deleted_at, device_id, next_clock_json],
    )?;
    Ok(true)
}

pub fn upsert_tombstone_from_sync(
    conn: &Connection,
    tombstone: &SyncedTombstone,
    sync_event_id: &str,
    mut invalidate_cache: impl FnMut(&str),
) -> Result<Option<String>, AppError> {
    let existing_note: Option<ExistingSyncedNote> = conn
        .query_row(
            "SELECT id,
                    locally_modified != 0,
                    markdown,
                    COALESCE(last_edit_device_id, ''),
                    created_at,
                    edited_at,
                    archived_at,
                    pinned_at,
                    readonly != 0,
                    COALESCE(vector_clock, '{}')
             FROM notes
             WHERE id = ?1",
            params![tombstone.id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                ))
            },
        )
        .optional()?;

    if let Some(existing) = &existing_note {
        let local_clock = parse_vector_clock(&existing.9).map_err(AppError::custom)?;
        let comparison = compare_vector_clocks(&local_clock, &tombstone.vector_clock)
            .map_err(AppError::custom)?;

        match comparison {
            VectorClockComparison::Dominates => return Ok(None),
            VectorClockComparison::Concurrent | VectorClockComparison::Equal => {
                store_tombstone_conflict(conn, tombstone, sync_event_id)?;
                invalidate_cache(&tombstone.id);
                return Ok(Some(tombstone.id.clone()));
            }
            VectorClockComparison::Dominated => {}
        }
    } else if let Some(existing) = load_existing_tombstone(conn, &tombstone.id)? {
        let local_clock = parse_vector_clock(&existing.2).map_err(AppError::custom)?;
        let comparison = compare_vector_clocks(&local_clock, &tombstone.vector_clock)
            .map_err(AppError::custom)?;

        match comparison {
            VectorClockComparison::Dominates | VectorClockComparison::Equal => return Ok(None),
            VectorClockComparison::Concurrent => return Ok(None),
            VectorClockComparison::Dominated => {}
        }
    }

    conn.execute(
        "DELETE FROM pending_deletions WHERE entity_id = ?1",
        params![tombstone.id],
    )?;
    clear_note_materialization(conn, &tombstone.id)?;
    clear_note_conflicts(conn, &tombstone.id)?;
    conn.execute(
        "INSERT INTO note_tombstones
           (id, deleted_at, last_edit_device_id, vector_clock, sync_event_id, locally_modified)
         VALUES (?1, ?2, ?3, ?4, ?5, 0)
         ON CONFLICT(id) DO UPDATE SET
           deleted_at = excluded.deleted_at,
           last_edit_device_id = excluded.last_edit_device_id,
           vector_clock = excluded.vector_clock,
           sync_event_id = excluded.sync_event_id,
           locally_modified = 0",
        params![
            tombstone.id,
            tombstone.deleted_at,
            tombstone.device_id,
            serialize_vector_clock(&tombstone.vector_clock).map_err(AppError::custom)?,
            sync_event_id,
        ],
    )?;
    invalidate_cache(&tombstone.id);
    Ok(Some(tombstone.id.clone()))
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

    let existing: Option<ExistingSyncedNote> = conn
        .query_row(
            "SELECT id,
                    locally_modified != 0,
                    markdown,
                    COALESCE(last_edit_device_id, ''),
                    created_at,
                    edited_at,
                    archived_at,
                    pinned_at,
                    readonly != 0,
                    COALESCE(vector_clock, '{}')
             FROM notes
             WHERE id = ?1",
            params![note.id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                ))
            },
        )
        .optional()?;

    if let Some(existing) = &existing {
        let local_clock: VectorClock =
            serde_json::from_str::<VectorClock>(&existing.9).unwrap_or_default();
        let comparison =
            compare_vector_clocks(&local_clock, &note.vector_clock).map_err(AppError::custom)?;

        match comparison {
            VectorClockComparison::Dominates => return Ok(None),
            VectorClockComparison::Concurrent => {
                store_note_conflict(conn, note, sync_event_id)?;
                return Ok(None);
            }
            VectorClockComparison::Equal if !snapshot_content_matches(note, existing) => {
                store_note_conflict(conn, note, sync_event_id)?;
                return Ok(None);
            }
            VectorClockComparison::Equal | VectorClockComparison::Dominated => {}
        }
    }

    if let Some(existing_tombstone) = load_existing_tombstone(conn, &note.id)? {
        let local_clock = parse_vector_clock(&existing_tombstone.2).map_err(AppError::custom)?;
        let comparison =
            compare_vector_clocks(&local_clock, &note.vector_clock).map_err(AppError::custom)?;

        match comparison {
            VectorClockComparison::Dominates => return Ok(None),
            VectorClockComparison::Concurrent | VectorClockComparison::Equal => {
                let tombstone_snapshot_id = existing_tombstone
                    .3
                    .clone()
                    .unwrap_or_else(|| format!("local-deleted:{}", note.id));
                store_tombstone_conflict(
                    conn,
                    &SyncedTombstone {
                        id: note.id.clone(),
                        device_id: existing_tombstone.0.clone(),
                        vector_clock: local_clock,
                        deleted_at: existing_tombstone.1,
                    },
                    &tombstone_snapshot_id,
                )?;
                clear_note_tombstone_state(conn, &note.id)?;
            }
            VectorClockComparison::Dominated => {
                clear_note_tombstone_state(conn, &note.id)?;
            }
        }
    }

    let vector_clock_json = serialize_vector_clock(&note.vector_clock).map_err(AppError::custom)?;

    if existing.is_some() {
        // Update existing note
        conn.execute(
            "UPDATE notes SET title = ?1, markdown = ?2, modified_at = ?3, edited_at = ?4, \
             archived_at = ?5, deleted_at = ?6, pinned_at = ?7, readonly = ?8, \
             last_edit_device_id = ?9, vector_clock = ?10, sync_event_id = ?11, locally_modified = 0 WHERE id = ?12",
            params![
                note.title,
                note.markdown,
                note.modified_at,
                note.edited_at,
                note.archived_at,
                note.deleted_at,
                note.pinned_at,
                i32::from(note.readonly),
                note.device_id,
                vector_clock_json,
                sync_event_id,
                note.id,
            ],
        )?;
    } else {
        // Insert new note
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, \
             archived_at, deleted_at, pinned_at, readonly, last_edit_device_id, vector_clock, \
             sync_event_id, locally_modified) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0)",
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
                note.device_id,
                vector_clock_json,
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
    conn.execute(
        "DELETE FROM note_conflicts WHERE sync_event_id = ?1",
        params![sync_event_id],
    )?;

    Ok(Some(note.id.clone()))
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;
    use crate::domain::sync::model::{SyncedNote, SyncedTombstone};
    use rusqlite::{params, Connection};

    fn setup_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        conn
    }

    fn make_synced_note(id: &str, modified_at: i64) -> SyncedNote {
        SyncedNote {
            id: id.to_string(),
            device_id: "DEVICE-A".to_string(),
            vector_clock: VectorClock::from([("DEVICE-A".to_string(), 1)]),
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

    fn make_synced_tombstone(id: &str, deleted_at: i64) -> SyncedTombstone {
        SyncedTombstone {
            id: id.to_string(),
            device_id: "DEVICE-A".to_string(),
            vector_clock: VectorClock::from([("DEVICE-A".to_string(), 2)]),
            deleted_at,
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
    fn upsert_stores_concurrent_remote_snapshot_as_conflict() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, last_edit_device_id, vector_clock)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                "note-1",
                "Local Title",
                "# Local Title\n\nLocal body",
                1000,
                2000,
                2000,
                "DEVICE-A",
                "{\"DEVICE-A\":2}"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Local Title", "# Local Title\n\nLocal body"],
        )
        .unwrap();

        let mut note = make_synced_note("note-1", 3000);
        note.device_id = "DEVICE-B".to_string();
        note.vector_clock =
            VectorClock::from([("DEVICE-A".to_string(), 1), ("DEVICE-B".to_string(), 1)]);
        note.title = "Remote Title".to_string();
        note.markdown = "# Remote Title\n\nRemote body".to_string();

        let result = upsert_from_sync(&conn, &note, "evt-conflict-1").unwrap();
        assert_eq!(result, None);

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        let conflict_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_conflicts WHERE note_id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(title, "Local Title");
        assert_eq!(conflict_count, 1);
    }

    #[test]
    fn local_tombstone_moves_note_into_graveyard() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, vector_clock)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "note-1",
                "Title",
                "# Title\n\nBody",
                1000,
                2000,
                2000,
                "{\"DEVICE-A\":1}"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Title", "# Title\n\nBody"],
        )
        .unwrap();

        let tombstoned = tombstone_note_locally(&conn, "note-1", 3000).unwrap();
        assert!(tombstoned);

        let notes_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let tombstone_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_tombstones WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let fts_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes_fts WHERE note_id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(notes_count, 0);
        assert_eq!(tombstone_count, 1);
        assert_eq!(fts_count, 0);
    }

    #[test]
    fn upsert_overwrites_clean_local_note_even_if_remote_timestamp_is_older() {
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
        assert_eq!(result, Some("note-1".to_string()));

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Title note-1");
    }

    #[test]
    fn upsert_skips_when_local_note_is_dirty() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
            params!["note-1", "Local Title", "Local body", 1000, 5000, 5000],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Local Title", "Local body"],
        )
        .unwrap();

        let note = make_synced_note("note-1", 9000);
        let result = upsert_from_sync(&conn, &note, "evt-4").unwrap();
        assert_eq!(result, None);

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Local Title");
    }

    #[test]
    fn tombstone_replaces_note_and_clears_materialized_state() {
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
        conn.execute(
            "INSERT INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
            params!["note-1", 3000],
        )
        .unwrap();

        let mut invalidated: Option<String> = None;
        let result = upsert_tombstone_from_sync(
            &conn,
            &make_synced_tombstone("note-1", 3000),
            "evt-del-1",
            |id: &str| {
                invalidated = Some(id.to_string());
            },
        )
        .unwrap();

        let notes_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        let fts_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes_fts", [], |row| row.get(0))
            .unwrap();
        let pending_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM pending_deletions", [], |row| {
                row.get(0)
            })
            .unwrap();
        let tombstone_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_tombstones", [], |row| row.get(0))
            .unwrap();

        assert_eq!(result, Some("note-1".to_string()));
        assert_eq!(notes_count, 0);
        assert_eq!(fts_count, 0);
        assert_eq!(pending_count, 0);
        assert_eq!(tombstone_count, 1);
        assert_eq!(invalidated.as_deref(), Some("note-1"));
    }

    #[test]
    fn concurrent_remote_tombstone_is_stored_as_conflict_without_deleting_note() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, last_edit_device_id, vector_clock)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                "note-1",
                "Local Title",
                "# Local Title\n\nLocal body",
                1000,
                2000,
                2000,
                "DEVICE-A",
                "{\"DEVICE-A\":2}"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Local Title", "# Local Title\n\nLocal body"],
        )
        .unwrap();

        let tombstone = SyncedTombstone {
            id: "note-1".to_string(),
            device_id: "DEVICE-B".to_string(),
            vector_clock: VectorClock::from([
                ("DEVICE-A".to_string(), 1),
                ("DEVICE-B".to_string(), 1),
            ]),
            deleted_at: 3000,
        };

        let result =
            upsert_tombstone_from_sync(&conn, &tombstone, "evt-del-conflict", |_| {}).unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let note_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let tombstone_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_tombstones WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let conflict_row: (String, Option<i64>) = conn
            .query_row(
                "SELECT op, deleted_at FROM note_conflicts WHERE sync_event_id = 'evt-del-conflict'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(note_count, 1);
        assert_eq!(tombstone_count, 0);
        assert_eq!(conflict_row.0, "del");
        assert_eq!(conflict_row.1, Some(3000));
    }

    #[test]
    fn upsert_remote_note_clears_stale_tombstone_and_pending_delete() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO note_tombstones (id, deleted_at, last_edit_device_id, vector_clock, locally_modified)
             VALUES (?1, ?2, ?3, ?4, 1)",
            params!["note-1", 3000, "DEVICE-A", "{\"DEVICE-A\":1}"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
            params!["note-1", 3000],
        )
        .unwrap();

        let mut note = make_synced_note("note-1", 4000);
        note.vector_clock = VectorClock::from([("DEVICE-A".to_string(), 2)]);

        let result = upsert_from_sync(&conn, &note, "evt-remote-put").unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let tombstone_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_tombstones WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let pending_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pending_deletions WHERE entity_id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(tombstone_count, 0);
        assert_eq!(pending_count, 0);
    }

    #[test]
    fn concurrent_remote_note_restores_note_and_preserves_tombstone_as_conflict() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO note_tombstones (id, deleted_at, last_edit_device_id, vector_clock, sync_event_id, locally_modified)
             VALUES (?1, ?2, ?3, ?4, ?5, 0)",
            params![
                "note-1",
                3000,
                "DEVICE-A",
                "{\"DEVICE-A\":2}",
                "evt-del-local"
            ],
        )
        .unwrap();

        let mut note = make_synced_note("note-1", 4000);
        note.device_id = "DEVICE-B".to_string();
        note.vector_clock =
            VectorClock::from([("DEVICE-A".to_string(), 1), ("DEVICE-B".to_string(), 1)]);

        let result = upsert_from_sync(&conn, &note, "evt-remote-put").unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let note_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let tombstone_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_tombstones WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let conflict_row: (String, Option<i64>) = conn
            .query_row(
                "SELECT op, deleted_at FROM note_conflicts WHERE sync_event_id = 'evt-del-local'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(note_count, 1);
        assert_eq!(tombstone_count, 0);
        assert_eq!(conflict_row.0, "del");
        assert_eq!(conflict_row.1, Some(3000));
    }
}
