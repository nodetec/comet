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
            Ok(_) => APIResponse::Data(None),
            Err(e) => APIResponse::Error(format!("Failed to tag note: {}", e)),
        }
    }

    pub fn untag_note(&self, tag_note_request: &TagNoteRequest) -> APIResponse<()> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::untag_note(&conn, &tag_note_request) {
            Ok(_) => APIResponse::Data(None),
            Err(e) => APIResponse::Error(format!("Failed to untag note: {}", e)),
        }
    }
}
