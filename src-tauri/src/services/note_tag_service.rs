use serde_json::Number;

use crate::{
    db,
    models::{APIResponse, DBConn, TagNoteRequest},
};
use std::sync::Arc;

pub struct NoteTagService {
    db_conn: Arc<DBConn>,
}

impl NoteTagService {
    pub fn new(db_conn: Arc<DBConn>) -> Self {
        NoteTagService { db_conn }
    }

    pub fn tag_note(&self, tag_note_request: TagNoteRequest) -> APIResponse<()> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::tag_note(&conn, &tag_note_request) {
            Ok(tag_id) => APIResponse {
                success: true,
                message: Some(format!("Tagged note successfully")),
                data: Some(()),

            },
            Err(e) => APIResponse {
                success: false,
                message: Some(format!("Failed to tag note")),
                data: None,
            },
        }
    }
}
