use crate::models::{ArchivedNote, CreateNoteRequest, ListNotesRequest, Note, UpdateNoteRequest};
use crate::utils::parse_datetime;
use rusqlite::{params, Connection, Result}; // Import the Note struct

use chrono::Utc;

use super::list_tags_for_note;

pub fn create_note(conn: &Connection, create_note_request: &CreateNoteRequest) -> Result<i64> {
    let now = Utc::now().to_rfc3339();
    let sql = "INSERT INTO notes (content, created_at, modified_at) VALUES (?1, ?2, ?3)";
    conn.execute(sql, params![&create_note_request.content, &now, &now,])
        .unwrap();
    Ok(conn.last_insert_rowid())
}

pub fn list_all_notes(
    conn: &Connection,
    list_notes_request: &ListNotesRequest,
) -> Result<Vec<Note>> {
    let mut stmt;
    let tag_id = match list_notes_request.tag_id {
        Some(tag_id) => tag_id,
        None => -1,
    };

    let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::new();
    if tag_id != -1 {
        // If tag_id is valid, add it to the parameters vector
        params_vec.push(&tag_id);
        stmt = conn.prepare(
        "SELECT n.id, n.content, n.created_at, n.modified_at FROM notes n JOIN notes_tags nt ON n.id = nt.note_id WHERE nt.tag_id = ?1 ORDER BY n.modified_at DESC",
    )?;
    } else {
        // No need to add parameters if tag_id is -1
        stmt = conn.prepare(
            "SELECT id, content, created_at, modified_at FROM notes ORDER BY modified_at DESC",
        )?;
    }

    // Use params_vec.as_slice() when you need to pass the parameters
    let notes_iter = stmt.query_map(params_vec.as_slice(), |row| {
        let created_at: String = row.get(2)?;
        let modified_at: String = row.get(3)?;
        Ok(Note {
            id: row.get(0)?,
            content: row.get(1)?,
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

pub fn get_note_by_id(conn: &Connection, note_id: &i64) -> Result<Note> {
    let mut stmt =
        conn.prepare("SELECT id, content, created_at, modified_at FROM notes WHERE id = ?1")?;
    stmt.query_row(params![note_id], |row| {
        let created_at: String = row.get(2)?;
        let modified_at: String = row.get(3)?;
        Ok(Note {
            id: row.get(0)?,
            content: row.get(1)?,
            created_at: parse_datetime(&created_at)?,
            modified_at: parse_datetime(&modified_at)?,
        })
    })
}

pub fn update_note(conn: &Connection, update_note_request: &UpdateNoteRequest) -> Result<i64> {
    let sql = "UPDATE notes SET content = ?1, modified_at = ?2 WHERE id = ?3";
    conn.execute(
        sql,
        params![
            &update_note_request.content,
            Utc::now().to_rfc3339(),
            &update_note_request.id
        ],
    )
    .unwrap();
    Ok(update_note_request.id)
}

pub fn delete_note(conn: &Connection, note_id: &i64) -> () {
    let sql = "DELETE FROM archived_notes WHERE id = ?1";
    conn.execute(sql, params![note_id]).unwrap();
}

pub fn archive_note(conn: &Connection, note_id: &i64) -> () {
    let now = Utc::now().to_rfc3339();
    match get_note_by_id(&conn, &note_id) {
        Ok(note) => {
            let sql =
                "INSERT INTO archived_notes (note_id, content, archived_at) VALUES (?1, ?2, ?3)";
            conn.execute(sql, params![note.id, note.content, &now,])
                .unwrap();
            let archived_note_id = conn.last_insert_rowid();
            match list_tags_for_note(&conn, &note_id) {
                Ok(tags) => {
                    for (tag_id) in &tags {
                        let sql =
                                "INSERT INTO archived_notes_tags (archived_note_id, tag_id) VALUES (?1, ?2)";
                        conn.execute(sql, params![archived_note_id, tag_id])
                            .unwrap();
                    }
                    let sql = "DELETE FROM notes_tags WHERE note_id = ?1";
                    conn.execute(sql, params![note_id]).unwrap();
                }
                Err(e) => (),
            }
            let sql = "DELETE FROM notes WHERE id = ?1";
            conn.execute(sql, params![note_id]).unwrap();
        }
        Err(e) => (),
    }
}

pub fn list_archived_notes(
    conn: &Connection,
    list_notes_request: &ListNotesRequest,
) -> Result<Vec<ArchivedNote>> {
    let mut stmt;
    let tag_id = match list_notes_request.tag_id {
        Some(tag_id) => tag_id,
        None => -1,
    };

    let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::new();
    if tag_id != -1 {
        // If tag_id is valid, add it to the parameters vector
        params_vec.push(&tag_id);
        stmt = conn.prepare(
        "SELECT an.id, an.note_id, an.content, an.created_at, an.deleted_at FROM archived_notes an JOIN archived_notes_tags ant ON an.id = ant.note_id WHERE ant.tag_id = ?1 ORDER BY an.deleted_at DESC",
    )?;
    } else {
        // No need to add parameters if tag_id is -1
        stmt = conn.prepare(
            "SELECT id, note_id, content, created_at, deleted_at FROM archived_notes ORDER BY deleted_at DESC",
        )?;
    }

    // Use params_vec.as_slice() when you need to pass the parameters
    let notes_iter = stmt.query_map(params_vec.as_slice(), |row| {
        let created_at: String = row.get(3)?;
        let deleted_at: String = row.get(4)?;
        Ok(ArchivedNote {
            id: row.get(0)?,
            note_id: row.get(1)?,
            content: row.get(2)?,
            created_at: parse_datetime(&created_at)?,
            deleted_at: parse_datetime(&deleted_at)?,
        })
    })?;

    let mut notes = Vec::new();
    for note in notes_iter {
        notes.push(note?);
    }

    Ok(notes)
}
