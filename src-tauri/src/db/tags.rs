use crate::{
    models::{CreateTagRequest, Tag, UpdateTagRequest},
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

pub fn list_all_tags(conn: &Connection) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare("SELECT id, name, color, icon, created_at FROM tags ORDER BY name ASC")?;
    let tag_iter = stmt.query_map(params![], |row| {
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
