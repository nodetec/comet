use crate::{
    models::{CreateTagRequest, ListTagsRequest, Tag, UpdateTagRequest},
    utils::parse_datetime,
};
use chrono::Utc;
use rusqlite::{params, Connection, Result}; // Assuming you have a Tag struct defined in your models

pub fn create_tag(conn: &Connection, create_tag_request: &CreateTagRequest) -> Result<i64> {
    let now = Utc::now().to_rfc3339();
    let sql = "INSERT INTO tags (name, color, icon, created_at) VALUES (?1, ?2, ?3, ?4)";
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
    let mut stmt = conn.prepare("SELECT id, name, color, icon, created_at FROM tags WHERE id = ?1")?;
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
    let mut stmt = conn.prepare("SELECT id, name, color, icon, created_at FROM tags WHERE name = ?1")?;
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
        "SELECT t.id, t.name, t.color, t.icon, t.created_at FROM tags t JOIN notes_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?1 ORDER BY t.name ASC",
    )?;
    } else {
        // No need to add parameters if note_id is -1
        stmt = conn.prepare(
            "SELECT id, name, color, icon, created_at FROM tags ORDER BY name ASC",
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
    let sql = "UPDATE tags SET name = ?1, color = ?2, icon = ?3 WHERE id = ?4";
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
    let sql = "DELETE FROM tags WHERE id = ?1";
    conn.execute(sql, params![tag_id]).unwrap();
}
