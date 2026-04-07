use serde::{Deserialize, Serialize};

use crate::domain::notes::model::WikiLinkResolutionInput;
use crate::domain::sync::vector_clock::VectorClock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SyncState {
    Disconnected,
    NeedsUnlock,
    Connecting,
    Authenticating,
    Syncing,
    Connected,
    Error { message: String },
}

#[derive(Debug)]
pub enum SyncCommand {
    PushNote(String),
    PushDeletion(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusPayload {
    pub state: SyncState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncChangePayload {
    pub note_id: String,
    pub action: String,
}

/// Note fields extracted from a synced snapshot event.
pub struct SyncedNote {
    pub id: String,
    pub device_id: String,
    pub vector_clock: VectorClock,
    pub title: String,
    pub markdown: String,
    pub created_at: i64,
    pub modified_at: i64,
    pub edited_at: i64,
    pub archived_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub readonly: bool,
    pub tags: Vec<String>,
    pub wikilink_resolutions: Vec<WikiLinkResolutionInput>,
}

pub struct SyncedTombstone {
    pub id: String,
    pub device_id: String,
    pub vector_clock: VectorClock,
    pub deleted_at: i64,
}
