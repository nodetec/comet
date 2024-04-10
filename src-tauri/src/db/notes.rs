use crate::models::{CreateNoteRequest, ListNotesRequest, Note, UpdateNoteRequest};
use crate::utils::parse_datetime;
use rusqlite::{params, Connection, Result}; // Import the Note struct

use chrono::Utc;

pub fn create_note(conn: &Connection, create_note_request: &CreateNoteRequest) -> Result<i64> {
    let now = Utc::now().to_rfc3339();
    let sql = "INSERT INTO notes (title, content, created_at, modified_at) VALUES (?1, ?2, ?3, ?4)";
    conn.execute(
        sql,
        params![
            &create_note_request.title,
            &create_note_request.content,
            &now,
            &now,
        ],
    );
    Ok(conn.last_insert_rowid())
}

pub fn list_all_notes(
    conn: &Connection,
    list_notes_request: &ListNotesRequest,
) -> Result<Vec<Note>> {
    let mut stmt;
    let tag_id = match list_notes_request.tag_id {
        Some(tag_id) => {
            println!("tag id {tag_id}");
            tag_id
        }
        None => {
            println!("no tag id");
            -1
        }
    };

    let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::new();
    if tag_id != -1 {
        // If tag_id is valid, add it to the parameters vector
        params_vec.push(&tag_id);
        stmt = conn.prepare(
        "SELECT n.id, n.title, n.content, n.created_at, n.modified_at FROM notes n JOIN notes_tags nt ON n.id = nt.note_id WHERE nt.tag_id = ?1 ORDER BY n.modified_at DESC",
    )?;
    } else {
        // No need to add parameters if tag_id is -1
        stmt = conn.prepare(
        "SELECT id, title, content, created_at, modified_at FROM notes ORDER BY modified_at DESC",
    )?;
    }

    // Use params_vec.as_slice() when you need to pass the parameters
    let notes_iter = stmt.query_map(params_vec.as_slice(), |row| {
        let created_at: String = row.get(3)?;
        let modified_at: String = row.get(4)?;
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            created_at: parse_datetime(&created_at)?,
            modified_at: parse_datetime(&modified_at)?,
        })
    })?;

    let mut notes = Vec::new();
    for note in notes_iter {
        notes.push(note?);
    }

    Ok(notes)
}

pub fn get_note_by_id(conn: &Connection, note_id: i32) -> Result<Note> {
    let mut stmt = conn
        .prepare("SELECT id, title, content, created_at, modified_at FROM notes WHERE id = ?1")?;
    stmt.query_row(params![note_id], |row| {
        let created_at: String = row.get(3)?;
        let modified_at: String = row.get(4)?;
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            created_at: parse_datetime(&created_at)?,
            modified_at: parse_datetime(&modified_at)?,
        })
    })
}

pub fn update_note(conn: &Connection, update_note_request: &UpdateNoteRequest) -> Result<i64> {
    let sql = "UPDATE notes SET title = ?1, content = ?2, modified_at = ?3 WHERE id = ?4";
    conn.execute(
        sql,
        params![
            &update_note_request.title,
            &update_note_request.content,
            Utc::now().to_rfc3339(),
            &update_note_request.id
        ],
    );
    Ok(update_note_request.id)
}

pub fn delete_note(conn: &Connection, note_id: i32) -> Result<usize> {
    let sql = "DELETE FROM notes WHERE id = ?1";
    conn.execute(sql, params![note_id])
}
