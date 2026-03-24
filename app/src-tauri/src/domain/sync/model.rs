use serde::{Deserialize, Serialize};

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
    PushNotebook(String),
    PushDeletion(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusPayload {
    pub state: SyncState,
}

/// Note fields extracted from a synced event rumor.
pub struct SyncedNote {
    pub id: String,
    pub title: String,
    pub markdown: String,
    pub notebook_id: Option<String>,
    pub created_at: i64,
    pub modified_at: i64,
    pub edited_at: i64,
    pub archived_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub readonly: bool,
    pub tags: Vec<String>,
}

/// Notebook fields extracted from a synced event rumor.
pub struct SyncedNotebook {
    pub id: String,
    pub name: String,
    pub updated_at: i64,
}
