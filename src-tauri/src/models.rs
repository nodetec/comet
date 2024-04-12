use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

pub struct DBConn(pub Arc<Mutex<Connection>>);

#[derive(Serialize)]
pub struct APIResponse<T> {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<T>,
}

// Notes
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListNotesRequest {
    pub tag_id: Option<i64>,
    pub search: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateNoteRequest {
    pub title: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct UpdateNoteRequest {
    pub id: i64,
    pub title: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
}

// Tags
#[derive(Deserialize)]
pub struct CreateTagRequest {
    pub name: String,
    pub color: String,
    pub icon: String,
}

#[derive(Deserialize)]
pub struct UpdateTagRequest {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub icon: String,
}

#[derive(Deserialize)]
// add debug to print the struct
#[derive(Debug)]
pub struct GetTagRequest {
    pub id: Option<i64>,
    pub name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub created_at: DateTime<Utc>,
}

// Note Tags
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagNoteRequest {
    pub note_id: i64,
    pub tag_id: i64,
}

