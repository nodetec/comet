use rusqlite::{params, Connection, Result};

use crate::models::TagNoteRequest;

// Function to add an association between a note and a tag
pub fn tag_note(conn: &Connection, tag_note_request: &TagNoteRequest) -> Result<usize> {
    let note_id = tag_note_request.note_id;
    let tag_id = tag_note_request.tag_id;
    let sql = "INSERT INTO notes_tags (note_id, tag_id) VALUES (?1, ?2)";
    conn.execute(sql, params![note_id, tag_id])
}

// Function to list all tags for a given note_id
pub fn list_tags_for_note(conn: &Connection, note_id: &i64) -> Result<Vec<i64>> {
    let mut stmt = conn.prepare("SELECT tag_id FROM notes_tags WHERE note_id = ?1")?;
    let tag_iter = stmt.query_map(params![note_id], |row| row.get(0))?;

    tag_iter.collect()
}

// Function to list all notes for a given tag_id
pub fn list_notes_for_tag(conn: &Connection, tag_id: &i64) -> Result<Vec<i32>> {
    let mut stmt = conn.prepare("SELECT note_id FROM notes_tags WHERE tag_id = ?1")?;
    let note_iter = stmt.query_map(params![tag_id], |row| row.get(0))?;

    note_iter.collect()
}

// Function to delete an association
pub fn untag_note(conn: &Connection, note_id: &i64, tag_id: &i64) -> Result<usize> {
    let sql = "DELETE FROM notes_tags WHERE note_id = ?1 AND tag_id = ?2";
    conn.execute(sql, params![note_id, tag_id])
}

