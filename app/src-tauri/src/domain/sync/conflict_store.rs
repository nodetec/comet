use crate::domain::sync::model::{SyncedNote, SyncedTombstone};
use crate::domain::sync::vector_clock::serialize_vector_clock;
use crate::error::AppError;
use rusqlite::{params, Connection};

pub fn store_note_conflict(
    conn: &Connection,
    note: &SyncedNote,
    snapshot_event_id: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO note_conflicts
           (snapshot_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
         VALUES (?1, ?2, 'put', ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, ?10, ?11, ?12)
         ON CONFLICT(snapshot_event_id) DO UPDATE SET
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
            snapshot_event_id,
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

pub fn store_tombstone_conflict(
    conn: &Connection,
    tombstone: &SyncedTombstone,
    snapshot_id: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO note_conflicts
           (snapshot_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
         VALUES (?1, ?2, 'del', ?3, ?4, NULL, NULL, ?5, NULL, ?6, NULL, NULL, 0, ?7)
         ON CONFLICT(snapshot_event_id) DO UPDATE SET
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

pub fn clear_note_conflicts(conn: &Connection, note_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM note_conflicts WHERE note_id = ?1",
        params![note_id],
    )?;
    Ok(())
}
