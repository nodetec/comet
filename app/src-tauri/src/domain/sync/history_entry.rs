use crate::adapters::sqlite::snapshot_repository::LocalNoteSnapshotHistoryEntry;
use crate::domain::sync::model::{SyncedNote, SyncedTombstone};
use crate::domain::sync::vector_clock::serialize_vector_clock;
use crate::error::AppError;

pub fn note_snapshot_history_entry(
    snapshot_event_id: &str,
    note: &SyncedNote,
    created_at: i64,
) -> Result<LocalNoteSnapshotHistoryEntry, AppError> {
    Ok(LocalNoteSnapshotHistoryEntry {
        snapshot_event_id: snapshot_event_id.to_string(),
        note_id: note.id.clone(),
        op: "put".to_string(),
        device_id: note.device_id.clone(),
        vector_clock: serialize_vector_clock(&note.vector_clock).map_err(AppError::custom)?,
        title: Some(note.title.clone()),
        markdown: Some(note.markdown.clone()),
        modified_at: note.modified_at,
        edited_at: Some(note.edited_at),
        deleted_at: note.deleted_at,
        archived_at: note.archived_at,
        pinned_at: note.pinned_at,
        readonly: note.readonly,
        created_at,
        wikilink_resolutions: note.wikilink_resolutions.clone(),
    })
}

pub fn tombstone_snapshot_history_entry(
    snapshot_event_id: &str,
    tombstone: &SyncedTombstone,
    created_at: i64,
) -> Result<LocalNoteSnapshotHistoryEntry, AppError> {
    Ok(LocalNoteSnapshotHistoryEntry {
        snapshot_event_id: snapshot_event_id.to_string(),
        note_id: tombstone.id.clone(),
        op: "del".to_string(),
        device_id: tombstone.device_id.clone(),
        vector_clock: serialize_vector_clock(&tombstone.vector_clock).map_err(AppError::custom)?,
        title: None,
        markdown: None,
        modified_at: tombstone.deleted_at,
        edited_at: Some(tombstone.deleted_at),
        deleted_at: Some(tombstone.deleted_at),
        archived_at: None,
        pinned_at: None,
        readonly: false,
        created_at,
        wikilink_resolutions: vec![],
    })
}
