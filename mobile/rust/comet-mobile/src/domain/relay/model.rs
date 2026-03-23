use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct Relay {
    pub url: String,
    pub kind: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    pub success_count: u64,
    pub fail_count: u64,
    pub relay_count: u64,
}

#[derive(Debug, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct PublishNoteInput {
    pub note_id: String,
    pub title: String,
    pub image: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct PublishShortNoteInput {
    pub note_id: String,
    pub tags: Vec<String>,
}
