use crate::db::queries::{
    TAG_NOTE, LIST_TAGS_FOR_NOTE, LIST_NOTES_FOR_TAG, UNTAG_NOTE
};

use rusqlite::{params, Connection, Result};

use crate::models::TagNoteRequest;

// Function to add an association between a note and a tag
pub fn tag_note(conn: &Connection, tag_note_request: &TagNoteRequest) -> Result<usize> {
    let note_id = tag_note_request.note_id;
    let tag_id = tag_note_request.tag_id;
    let sql = TAG_NOTE;
    conn.execute(sql, params![note_id, tag_id])
}

// Function to list all tags for a given note_id
pub fn list_tags_for_note(conn: &Connection, note_id: &i64) -> Result<Vec<i64>> {
    let mut stmt = conn.prepare(LIST_TAGS_FOR_NOTE)?;
    let tag_iter = stmt.query_map(params![note_id], |row| row.get(0))?;

    tag_iter.collect()
}

// Function to list all notes for a given tag_id
pub fn list_notes_for_tag(conn: &Connection, tag_id: &i64) -> Result<Vec<i32>> {
    let mut stmt = conn.prepare(LIST_NOTES_FOR_TAG)?;
    let note_iter = stmt.query_map(params![tag_id], |row| row.get(0))?;

    note_iter.collect()
}

// Function to delete an association
pub fn untag_note(conn: &Connection, tag_note_request: &TagNoteRequest) -> Result<usize> {
    let note_id = tag_note_request.note_id;
    let tag_id = tag_note_request.tag_id;
    let sql = UNTAG_NOTE;
    conn.execute(sql, params![note_id, tag_id])
}
