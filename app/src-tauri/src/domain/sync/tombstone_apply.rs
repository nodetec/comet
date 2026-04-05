use crate::domain::sync::apply_support::{
    clear_note_materialization, current_device_id, load_existing_note, load_existing_tombstone,
};
use crate::domain::sync::conflict_store::{clear_note_conflicts, store_tombstone_conflict};
use crate::domain::sync::model::SyncedTombstone;
use crate::domain::sync::vector_clock::{
    compare_vector_clocks, increment_vector_clock, parse_vector_clock, serialize_vector_clock,
    VectorClockComparison,
};
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};

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
           snapshot_event_id = NULL",
        params![note_id, deleted_at, device_id, next_clock_json],
    )?;
    Ok(true)
}

pub fn upsert_tombstone_from_sync(
    conn: &Connection,
    tombstone: &SyncedTombstone,
    snapshot_event_id: &str,
    mut invalidate_cache: impl FnMut(&str),
) -> Result<Option<String>, AppError> {
    if let Some(existing_note) = load_existing_note(conn, &tombstone.id)? {
        let local_clock =
            parse_vector_clock(&existing_note.vector_clock_json).map_err(AppError::custom)?;
        let comparison = compare_vector_clocks(&local_clock, &tombstone.vector_clock)
            .map_err(AppError::custom)?;

        match comparison {
            VectorClockComparison::Dominates => return Ok(None),
            VectorClockComparison::Concurrent | VectorClockComparison::Equal => {
                store_tombstone_conflict(conn, tombstone, snapshot_event_id)?;
                invalidate_cache(&tombstone.id);
                return Ok(Some(tombstone.id.clone()));
            }
            VectorClockComparison::Dominated => {}
        }
    } else if let Some(existing_tombstone) = load_existing_tombstone(conn, &tombstone.id)? {
        let local_clock =
            parse_vector_clock(&existing_tombstone.vector_clock_json).map_err(AppError::custom)?;
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
           (id, deleted_at, last_edit_device_id, vector_clock, snapshot_event_id, locally_modified)
         VALUES (?1, ?2, ?3, ?4, ?5, 0)
         ON CONFLICT(id) DO UPDATE SET
           deleted_at = excluded.deleted_at,
           last_edit_device_id = excluded.last_edit_device_id,
           vector_clock = excluded.vector_clock,
           snapshot_event_id = excluded.snapshot_event_id,
           locally_modified = 0",
        params![
            tombstone.id,
            tombstone.deleted_at,
            tombstone.device_id,
            serialize_vector_clock(&tombstone.vector_clock).map_err(AppError::custom)?,
            snapshot_event_id,
        ],
    )?;
    invalidate_cache(&tombstone.id);
    Ok(Some(tombstone.id.clone()))
}
