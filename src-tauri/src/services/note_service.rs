use crate::{
    db,
    models::{APIResponse, CreateNoteRequest, DBConn, ListNotesRequest, Note, UpdateNoteRequest},
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

    pub fn update_note(&self, update_note_request: UpdateNoteRequest) -> APIResponse<Note> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::update_note(&conn, &update_note_request) {
            Ok(note_id) => {
                match db::get_note_by_id(&conn, note_id as i32) {
                    // Ensure type matches your ID field
                    Ok(note) => APIResponse {
                        success: true,
                        message: Some("Note updated successfully".to_string()),
                        data: Some(note),
                    },
                    Err(e) => APIResponse {
                        success: false,
                        message: Some(format!("Failed to retrieve updated note: {}", e)),
                        data: None,
                    },
                }
            }
            Err(e) => APIResponse {
                success: false,
                message: Some(format!("Failed to update note: {}", e)),
                data: None,
            },
        }
    }

    pub fn list_notes(&self, list_notes_request: &ListNotesRequest) -> APIResponse<Vec<Note>> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::list_all_notes(&conn, &list_notes_request) {
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
