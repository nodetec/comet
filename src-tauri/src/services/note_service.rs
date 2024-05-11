use crate::{
    db,
    models::{
        APIResponse, CreateNoteRequest, DBConn, ListNotesRequest, Note, NoteFilter,
        UpdateNoteRequest,
    },
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
            Ok(note_id) => match db::get_note_by_id(&conn, &note_id) {
                Ok(note) => APIResponse::Data(Some(note)),
                Err(e) => APIResponse::Error(format!("Failed to retrieve created note: {}", e)),
            },
            Err(e) => APIResponse::Error(format!("Failed to create note: {}", e)),
        }
    }

    pub fn update_note(&self, update_note_request: UpdateNoteRequest) -> APIResponse<Note> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::update_note(&conn, &update_note_request) {
            Ok(note_id) => match db::get_note_by_id(&conn, &note_id) {
                Ok(note) => APIResponse::Data(Some(note)),
                Err(e) => APIResponse::Error(format!("Failed to retrieve updated note: {}", e)),
            },
            Err(e) => APIResponse::Error(format!("Failed to update note: {}", e)),
        }
    }

    pub fn list_notes(&self, list_notes_request: &ListNotesRequest) -> APIResponse<Vec<Note>> {
        let conn = self.db_conn.0.lock().unwrap();

        match list_notes_request.filter {
            NoteFilter::All => match db::list_all_notes(&conn, &list_notes_request) {
                Ok(notes) => APIResponse::Data(Some(notes)),
                Err(e) => APIResponse::Error(format!("Failed to retrieve notes: {}", e)),
            },

            NoteFilter::Trashed => match db::list_trashed_notes(&conn, &list_notes_request) {
                Ok(notes) => APIResponse::Data(Some(notes)),
                Err(e) => APIResponse::Error(format!("Failed to retrieve notes: {}", e)),
            },
        }
    }

    pub fn get_note(&self, note_id: &i64) -> APIResponse<Note> {
        let conn = self.db_conn.0.lock().unwrap();
        match db::get_note_by_id(&conn, &note_id) {
            Ok(note) => APIResponse::Data(Some(note)),
            Err(e) => APIResponse::Error(format!("Failed to retrieve note: {}", e)),
        }
    }

    pub fn trash_note(&self, note_id: &i64) -> () {
        let conn = self.db_conn.0.lock().unwrap();
        db::trash_note(&conn, &note_id);
    }

    pub fn delete_note(&self, note_id: &i64) -> () {
        let conn = self.db_conn.0.lock().unwrap();
        db::delete_note(&conn, &note_id);
    }
}
