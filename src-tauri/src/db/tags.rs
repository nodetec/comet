use crate::db::queries::{
    GET_TAG, GET_TAG_BY_NAME, INSERT_TAG, LIST_ALL_TAGS, LIST_ALL_TAGS_BY_NOTE, UPDATE_TAG, DELETE_TAG
};
use crate::{
    models::{CreateTagRequest, ListTagsRequest, Tag, UpdateTagRequest},
    utils::parse_datetime,
};
use chrono::Utc;
use rusqlite::{params, Connection, Result};

pub fn create_tag(conn: &Connection, create_tag_request: &CreateTagRequest) -> Result<i64> {
    let now = Utc::now().to_rfc3339();
    let sql = INSERT_TAG;
    conn.execute(
        sql,
        params![
            &create_tag_request.name,
            &create_tag_request.color,
            &create_tag_request.icon,
            &now
        ],
    ).unwrap();
    Ok(conn.last_insert_rowid())
}

pub fn get_tag_by_id(conn: &Connection, tag_id: i64) -> Result<Tag> {
    let mut stmt = conn.prepare(GET_TAG)?;
    stmt.query_row(params![tag_id], |row| {
        let created_at: String = row.get(4)?;
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            icon: row.get(3)?,
            created_at: parse_datetime(&created_at)?,
        })
    })
}

pub fn get_tag_by_name(conn: &Connection, tag_name: &str) -> Result<Tag> {
    let mut stmt = conn.prepare(GET_TAG_BY_NAME)?;
    stmt.query_row(params![tag_name], |row| {
        let created_at: String = row.get(4)?;
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            icon: row.get(3)?,
            created_at: parse_datetime(&created_at)?,
        })
    })
}

pub fn list_all_tags(
    conn: &Connection,
    list_notes_request: &ListTagsRequest,
) -> Result<Vec<Tag>> {
    let mut stmt;
    let note_id = match list_notes_request.note_id {
        Some(note_id) => note_id,
        None => -1,
    };
    println!("{note_id}");
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::new();

    if note_id != -1 {
        // If note_id is valid, add it to the parameters vector
        params_vec.push(&note_id);
        stmt = conn.prepare(
            LIST_ALL_TAGS,
    )?;
    } else {
        // No need to add parameters if note_id is -1
        stmt = conn.prepare(
            LIST_ALL_TAGS_BY_NOTE,
        )?;
    }

    // let mut stmt = conn.prepare("SELECT id, name, color, icon, created_at FROM tags ORDER BY name ASC")?;
    let tag_iter = stmt.query_map(params_vec.as_slice(), |row| {
        let created_at: String = row.get(4)?;
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            icon: row.get(3)?,
            created_at: parse_datetime(&created_at)?,
        })
    })?;

    let mut tags = Vec::new();
    for tag in tag_iter {
        tags.push(tag?);
    }

    Ok(tags)
}

pub fn update_tag(conn: &Connection, update_tag_request: &UpdateTagRequest) -> Result<usize> {
    let sql = UPDATE_TAG;
    conn.execute(
        sql,
        params![
            &update_tag_request.name,
            &update_tag_request.color,
            &update_tag_request.icon,
            &update_tag_request.id
        ],
    )
}

pub fn delete_tag(conn: &Connection, tag_id: &i64) -> () {
    let sql = DELETE_TAG;
    conn.execute(sql, params![tag_id]).unwrap();
}
