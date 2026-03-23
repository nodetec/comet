use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Relay {
    pub url: String,
    pub kind: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    pub success_count: usize,
    pub fail_count: usize,
    pub relay_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishNoteInput {
    pub note_id: String,
    pub title: String,
    pub image: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishShortNoteInput {
    pub note_id: String,
    pub tags: Vec<String>,
}
