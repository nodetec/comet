use crate::domain::common::text::extract_tags;
use crate::domain::sync::apply_support::{
    clear_note_tombstone_state, load_existing_note, load_existing_tombstone,
    snapshot_content_matches,
};
use crate::domain::sync::conflict_store::{
    clear_resolved_note_conflicts, store_note_conflict, store_tombstone_conflict,
};
use crate::domain::sync::model::{SyncedNote, SyncedTombstone};
use crate::domain::sync::vector_clock::{
    compare_vector_clocks, parse_vector_clock, serialize_vector_clock, VectorClock,
    VectorClockComparison,
};
use crate::error::AppError;
use rusqlite::{params, Connection};

pub fn upsert_from_sync(
    conn: &Connection,
    note: &SyncedNote,
    snapshot_event_id: &str,
) -> Result<Option<String>, AppError> {
    let parsed_direct_tags = extract_tags(&note.markdown);
    if !note.tags.is_empty() && note.tags != parsed_direct_tags {
        eprintln!(
            "[sync] direct tag mismatch for note={} payload_tags={:?} parsed_tags={:?}",
            note.id, note.tags, parsed_direct_tags
        );
    }

    let existing = load_existing_note(conn, &note.id)?;

    if let Some(existing) = &existing {
        if existing.is_locally_modified {
            return Ok(None);
        }

        let local_clock: VectorClock =
            serde_json::from_str::<VectorClock>(&existing.vector_clock_json).unwrap_or_default();
        let comparison =
            compare_vector_clocks(&local_clock, &note.vector_clock).map_err(AppError::custom)?;

        match comparison {
            VectorClockComparison::Dominates => return Ok(None),
            VectorClockComparison::Concurrent => {
                store_note_conflict(conn, note, snapshot_event_id)?;
                return Ok(None);
            }
            VectorClockComparison::Equal if !snapshot_content_matches(note, existing) => {
                store_note_conflict(conn, note, snapshot_event_id)?;
                return Ok(None);
            }
            VectorClockComparison::Equal | VectorClockComparison::Dominated => {}
        }
    }

    if let Some(existing_tombstone) = load_existing_tombstone(conn, &note.id)? {
        let local_clock =
            parse_vector_clock(&existing_tombstone.vector_clock_json).map_err(AppError::custom)?;
        let comparison =
            compare_vector_clocks(&local_clock, &note.vector_clock).map_err(AppError::custom)?;

        match comparison {
            VectorClockComparison::Dominates => return Ok(None),
            VectorClockComparison::Concurrent | VectorClockComparison::Equal => {
                let tombstone_snapshot_id = existing_tombstone
                    .snapshot_event_id
                    .clone()
                    .unwrap_or_else(|| format!("local-deleted:{}", note.id));
                store_tombstone_conflict(
                    conn,
                    &SyncedTombstone {
                        id: note.id.clone(),
                        device_id: existing_tombstone.device_id.clone(),
                        vector_clock: local_clock,
                        deleted_at: existing_tombstone.deleted_at,
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
        conn.execute(
            "UPDATE notes SET title = ?1, markdown = ?2, modified_at = ?3, edited_at = ?4, \
             archived_at = ?5, deleted_at = ?6, pinned_at = ?7, readonly = ?8, \
             last_edit_device_id = ?9, vector_clock = ?10, snapshot_event_id = ?11, locally_modified = 0 WHERE id = ?12",
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
                snapshot_event_id,
                note.id,
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, \
             archived_at, deleted_at, pinned_at, readonly, last_edit_device_id, vector_clock, \
             snapshot_event_id, locally_modified) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0)",
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
                snapshot_event_id,
            ],
        )?;
    }

    crate::adapters::sqlite::tag_index::rebuild_note_tag_index(conn, &note.id, &note.markdown)?;
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note.id])?;
    conn.execute(
        "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
        params![note.id, note.title, note.markdown],
    )?;
    clear_resolved_note_conflicts(conn, &note.id, &note.vector_clock)?;

    Ok(Some(note.id.clone()))
}
