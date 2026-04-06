use crate::domain::sync::model::{SyncedNote, SyncedTombstone};
use crate::domain::sync::vector_clock::{
    compare_vector_clocks, merge_vector_clocks, parse_vector_clock, serialize_vector_clock,
    VectorClock, VectorClockComparison,
};
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

pub fn merge_note_conflict_clocks(
    conn: &Connection,
    note_id: &str,
    base_clock: &VectorClock,
) -> Result<VectorClock, AppError> {
    let mut merged_clock = base_clock.clone();
    let mut stmt = conn.prepare(
        "SELECT vector_clock
         FROM note_conflicts
         WHERE note_id = ?1",
    )?;
    let rows = stmt.query_map(params![note_id], |row| row.get::<_, String>(0))?;

    for row in rows {
        let conflict_clock = parse_vector_clock(&row?).map_err(AppError::custom)?;
        merged_clock =
            merge_vector_clocks(&merged_clock, &conflict_clock).map_err(AppError::custom)?;
    }

    Ok(merged_clock)
}

pub fn clear_resolved_note_conflicts(
    conn: &Connection,
    note_id: &str,
    resolved_clock: &VectorClock,
) -> Result<(), AppError> {
    let mut resolved_snapshot_ids = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT snapshot_event_id, vector_clock
         FROM note_conflicts
         WHERE note_id = ?1",
    )?;
    let rows = stmt.query_map(params![note_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for row in rows {
        let (snapshot_event_id, vector_clock_json) = row?;
        let conflict_clock = parse_vector_clock(&vector_clock_json).map_err(AppError::custom)?;
        let comparison =
            compare_vector_clocks(&conflict_clock, resolved_clock).map_err(AppError::custom)?;

        if matches!(
            comparison,
            VectorClockComparison::Dominated | VectorClockComparison::Equal
        ) {
            resolved_snapshot_ids.push(snapshot_event_id);
        }
    }

    for snapshot_event_id in resolved_snapshot_ids {
        conn.execute(
            "DELETE FROM note_conflicts WHERE snapshot_event_id = ?1",
            params![snapshot_event_id],
        )?;
    }

    Ok(())
}
