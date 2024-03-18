use crate::{
    db,
    models::{APIResponse, CreateNoteRequest, DBConn, Note},
};
use std::sync::Arc;

pub struct NoteService {
    db_conn: Arc<DBConn>,
}

impl NoteService {
    pub fn new(db_conn: Arc<DBConn>) -> Self {
        NoteService { db_conn }
    }

    pub fn create_note(&self, create_note_request: CreateNoteRequest) -> APIResponse<Note> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::create_note(&conn, &create_note_request) {
            Ok(note_id) => {
                match db::get_note_by_id(&conn, note_id as i32) {
                    // Ensure type matches your ID field
                    Ok(note) => APIResponse {
                        success: true,
                        message: Some("Note created successfully".to_string()),
                        data: Some(note),
                    },
                    Err(e) => APIResponse {
                        success: false,
                        message: Some(format!("Failed to retrieve created note: {}", e)),
                        data: None,
                    },
                }
            }
            Err(e) => APIResponse {
                success: false,
                message: Some(format!("Failed to create note: {}", e)),
                data: None,
            },
        }
    }

    pub fn list_notes(&self) -> APIResponse<Vec<Note>> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::list_all_notes(&conn) {
            Ok(notes) => APIResponse {
                success: true,
                message: Some("Notes retrieved successfully".to_string()),
                data: Some(notes),
            },
            Err(e) => APIResponse {
                success: false,
                message: Some(format!("Failed to retrieve notes: {}", e)),
                data: None,
            },
        }
    }
}
