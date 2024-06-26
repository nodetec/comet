use crate::db::queries::{
    DELETE_FTS_NOTE, DELETE_NOTE, DELETE_NOTE_TAGS, DELETE_TRASHED_NOTE, GET_NOTE, INSERT_FTS_NOTE,
    INSERT_NOTE, LIST_ALL_NOTES, LIST_ALL_NOTES_BY_TAG, LIST_ALL_TRASHED_NOTES,
    LIST_ALL_TRASHED_NOTES_BY_TAG, SEARCH_NOTES, TRASH_NOTE, TRASH_NOTE_TAGS, UPDATE_FTS_NOTE,
    UPDATE_NOTE,
};
use crate::models::{CreateNoteRequest, ListNotesRequest, Note, UpdateNoteRequest};
use crate::utils::parse_datetime;
use rusqlite::{params, Connection, Result}; // Import the Note struct

use chrono::Utc;

use super::list_tags_for_note;

pub fn create_note(conn: &Connection, create_note_request: &CreateNoteRequest) -> Result<i64> {
    let now = Utc::now().to_rfc3339();
    let sql = INSERT_NOTE;
    conn.execute(sql, params![&create_note_request.content, &now, &now,])
        .unwrap();
    let rowid = conn.last_insert_rowid();
    let sql_fts5 = INSERT_FTS_NOTE;
    conn.execute(
        sql_fts5,
        params![rowid, &create_note_request.content, &now, &now,],
    )
    .unwrap();
    Ok(rowid)
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

    let search = match &list_notes_request.search {
        Some(search) => search,
        None => "",
    };

    let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::new();

    // params_vec.push(&list_notes_request.limit);
    // params_vec.push(&list_notes_request.offset);
    println!("page: {}", list_notes_request.page);
    println!("page_size: {}", list_notes_request.page_size);
    let offset = (list_notes_request.page) * list_notes_request.page_size;
    let limit = list_notes_request.page_size;
    println!("offset: {}", offset);
    params_vec.push(&limit);
    params_vec.push(&offset);

    if tag_id != -1 {
        // If tag_id is valid, add it to the parameters vector
        params_vec.push(&tag_id);
        stmt = conn.prepare(LIST_ALL_NOTES_BY_TAG)?;
    } else {
        // No need to add parameters if tag_id is -1
        stmt = conn.prepare(LIST_ALL_NOTES)?;
    }

    // TODO: search with active tag

    let search = format!("{}", search);

    if search != "" {
        params_vec.push(&search);
        stmt = conn.prepare(SEARCH_NOTES)?;
    }

    println!("search: {}", search);

    // Use params_vec.as_slice() when you need to pass the parameters
    let notes_iter = stmt.query_map(params_vec.as_slice(), |row| {
        let created_at: String = row.get(2)?;
        let modified_at: String = row.get(3)?;
        Ok(Note {
            id: row.get(0)?,
            content: row.get(1)?,
            created_at: parse_datetime(&created_at)?,
            modified_at: Some(parse_datetime(&modified_at).unwrap()),
            trashed_at: None,
        })
    })?;

    let mut notes = Vec::new();
    for note in notes_iter {
        notes.push(note?);
    }

    Ok(notes)
}

pub fn get_note_by_id(conn: &Connection, note_id: &i64) -> Result<Note> {
    let mut stmt = conn.prepare(GET_NOTE)?;
    stmt.query_row(params![note_id], |row| {
        let created_at: String = row.get(2)?;
        let modified_at: String = row.get(3)?;
        Ok(Note {
            id: row.get(0)?,
            content: row.get(1)?,
            created_at: parse_datetime(&created_at)?,
            modified_at: Some(parse_datetime(&modified_at).unwrap()),
            trashed_at: None,
        })
    })
}

pub fn update_note(conn: &Connection, update_note_request: &UpdateNoteRequest) -> Result<i64> {
    let sql = UPDATE_NOTE;
    conn.execute(
        sql,
        params![
            &update_note_request.content,
            Utc::now().to_rfc3339(),
            &update_note_request.id
        ],
    )
    .unwrap();

    let sql_fts5 = UPDATE_FTS_NOTE;
    conn.execute(
        sql_fts5,
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
    let sql = DELETE_TRASHED_NOTE;
    conn.execute(sql, params![note_id]).unwrap();
}

pub fn trash_note(conn: &Connection, note_id: &i64) -> () {
    let now = Utc::now().to_rfc3339();
    match get_note_by_id(&conn, &note_id) {
        Ok(note) => {
            let sql = TRASH_NOTE;
            conn.execute(
                sql,
                params![note.id, note.content, note.created_at.to_rfc3339(), &now,],
            )
            .unwrap();
            let trashed_note_id = conn.last_insert_rowid();
            match list_tags_for_note(&conn, &note_id) {
                Ok(tags) => {
                    tags.iter().for_each(|tag_id| {
                        let sql = TRASH_NOTE_TAGS;
                        conn.execute(sql, params![trashed_note_id, tag_id]).unwrap();
                    });
                    let sql = DELETE_NOTE_TAGS;
                    conn.execute(sql, params![note_id]).unwrap();
                }
                Err(e) => (),
            }
            let sql = DELETE_NOTE;
            conn.execute(sql, params![note_id]).unwrap();
            let sql_fts5 = DELETE_FTS_NOTE;
            conn.execute(sql_fts5, params![note_id]).unwrap();
        }
        Err(e) => (),
    }
}

pub fn list_trashed_notes(
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
        stmt = conn.prepare(LIST_ALL_TRASHED_NOTES_BY_TAG)?;
    } else {
        // No need to add parameters if tag_id is -1
        stmt = conn.prepare(LIST_ALL_TRASHED_NOTES)?;
    }

    // Use params_vec.as_slice() when you need to pass the parameters
    let notes_iter = stmt.query_map(params_vec.as_slice(), |row| {
        let created_at: String = row.get(3)?;
        let trashed_at: String = row.get(4)?;
        Ok(Note {
            id: row.get(0)?,
            content: row.get(2)?,
            modified_at: None,
            created_at: parse_datetime(&created_at)?,
            trashed_at: Some(parse_datetime(&trashed_at).unwrap()),
        })
    })?;

    let mut notes = Vec::new();
    for note in notes_iter {
        notes.push(note?);
    }

    Ok(notes)
}
