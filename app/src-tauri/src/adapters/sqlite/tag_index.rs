use std::collections::HashMap;
use std::time::Instant;

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;

use crate::domain::common::text::{ancestor_tag_paths, extract_tags};
use crate::error::AppError;

const TAG_INDEX_VERSION_KEY: &str = "tag_index_version";
const TAG_INDEX_STATUS_KEY: &str = "tag_index_status";
const TAG_INDEX_LAST_REBUILT_AT_KEY: &str = "tag_index_last_rebuilt_at";
const TAG_INDEX_VERSION: &str = "bear_tags_v1";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagIndexDiagnostics {
    pub version: Option<String>,
    pub status: Option<String>,
    pub last_rebuilt_at: Option<i64>,
    pub tag_count: i64,
    pub link_count: i64,
    pub direct_link_count: i64,
}

pub fn ensure_tag_index_ready(conn: &mut Connection) -> Result<(), AppError> {
    let version = app_setting(conn, TAG_INDEX_VERSION_KEY)?;
    let status = app_setting(conn, TAG_INDEX_STATUS_KEY)?;

    if version.as_deref() == Some(TAG_INDEX_VERSION) && status.as_deref() == Some("ready") {
        return Ok(());
    }

    log::info!(
        "[tags] tag index not ready version={:?} status={:?}; starting repair",
        version,
        status
    );
    repair_tag_index(conn).map(|_| ())
}

pub fn repair_tag_index(conn: &mut Connection) -> Result<TagIndexDiagnostics, AppError> {
    let started_at = Instant::now();

    match rebuild_tag_index(conn) {
        Ok(()) => {
            let diagnostics = tag_index_diagnostics(conn)?;
            log::info!(
                "[tags] tag index rebuilt status={:?} tags={} links={} direct_links={} elapsed_ms={}",
                diagnostics.status,
                diagnostics.tag_count,
                diagnostics.link_count,
                diagnostics.direct_link_count,
                started_at.elapsed().as_millis()
            );
            Ok(diagnostics)
        }
        Err(error) => {
            let _ = set_app_setting(conn, TAG_INDEX_STATUS_KEY, "failed");
            log::error!("[tags] tag index rebuild failed: {error}");
            Err(error)
        }
    }
}

pub fn tag_index_diagnostics(conn: &Connection) -> Result<TagIndexDiagnostics, AppError> {
    let version = app_setting(conn, TAG_INDEX_VERSION_KEY)?;
    let status = app_setting(conn, TAG_INDEX_STATUS_KEY)?;
    let last_rebuilt_at = app_setting(conn, TAG_INDEX_LAST_REBUILT_AT_KEY)?
        .and_then(|value| value.parse::<i64>().ok());
    let tag_count: i64 = conn.query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))?;
    let link_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM note_tag_links", [], |row| row.get(0))?;
    let direct_link_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM note_tag_links WHERE is_direct = 1",
        [],
        |row| row.get(0),
    )?;

    Ok(TagIndexDiagnostics {
        version,
        status,
        last_rebuilt_at,
        tag_count,
        link_count,
        direct_link_count,
    })
}

pub fn rebuild_tag_index(conn: &mut Connection) -> Result<(), AppError> {
    set_app_setting(conn, TAG_INDEX_VERSION_KEY, TAG_INDEX_VERSION)?;
    set_app_setting(conn, TAG_INDEX_STATUS_KEY, "rebuilding")?;

    let transaction = conn.transaction()?;
    transaction.execute("DELETE FROM note_tag_links", [])?;
    transaction.execute("DELETE FROM tags", [])?;

    let notes = {
        let mut statement = transaction.prepare("SELECT id, markdown FROM notes")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    log::info!("[tags] rebuilding tag index for {} notes", notes.len());

    let mut cache = HashMap::new();
    for (note_id, markdown) in notes {
        rebuild_note_tag_index_with_cache(&transaction, &mut cache, &note_id, &markdown)?;
    }

    verify_tag_index(&transaction)?;
    transaction.commit()?;

    set_app_setting(conn, TAG_INDEX_STATUS_KEY, "ready")?;
    set_app_setting(
        conn,
        TAG_INDEX_LAST_REBUILT_AT_KEY,
        &crate::domain::common::time::now_millis().to_string(),
    )?;

    Ok(())
}

pub fn rebuild_note_tag_index(
    conn: &Connection,
    note_id: &str,
    markdown: &str,
) -> Result<(), rusqlite::Error> {
    let mut cache = HashMap::new();
    log::debug!("[tags] rebuilding note tag index note_id={note_id}");
    rebuild_note_tag_index_with_cache(conn, &mut cache, note_id, markdown)
}

fn rebuild_note_tag_index_with_cache(
    conn: &impl TagIndexConn,
    cache: &mut HashMap<String, i64>,
    note_id: &str,
    markdown: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM note_tag_links WHERE note_id = ?1",
        params![note_id],
    )?;

    let direct_tags = extract_tags(markdown);
    for direct_tag in direct_tags {
        let direct_tag_id = ensure_tag_row(conn, cache, &direct_tag)?;
        conn.execute(
            "INSERT INTO note_tag_links (note_id, tag_id, is_direct) VALUES (?1, ?2, 1)",
            params![note_id, direct_tag_id],
        )?;

        for ancestor in ancestor_tag_paths(&direct_tag) {
            let ancestor_id = ensure_tag_row(conn, cache, &ancestor)?;
            conn.execute(
                "INSERT OR IGNORE INTO note_tag_links (note_id, tag_id, is_direct) VALUES (?1, ?2, 0)",
                params![note_id, ancestor_id],
            )?;
        }
    }

    Ok(())
}

fn ensure_tag_row(
    conn: &impl TagIndexConn,
    cache: &mut HashMap<String, i64>,
    path: &str,
) -> Result<i64, rusqlite::Error> {
    if let Some(id) = cache.get(path) {
        return Ok(*id);
    }

    let parent_path = path.rsplit_once('/').map(|(parent, _)| parent.to_string());
    let parent_id = if let Some(parent_path) = parent_path {
        Some(ensure_tag_row(conn, cache, &parent_path)?)
    } else {
        None
    };
    let last_segment = path.rsplit('/').next().unwrap_or(path);
    let depth = path.split('/').count() as i64;
    let now = crate::domain::common::time::now_millis();

    conn.execute(
        "INSERT OR IGNORE INTO tags (path, parent_id, last_segment, depth, pinned, hide_subtag_notes, icon, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, 0, NULL, ?5, ?5)",
        params![path, parent_id, last_segment, depth, now],
    )?;

    let id: i64 = conn.query_row(
        "SELECT id FROM tags WHERE path = ?1",
        params![path],
        |row| row.get(0),
    )?;
    cache.insert(path.to_string(), id);
    Ok(id)
}

fn verify_tag_index(transaction: &Transaction<'_>) -> Result<(), AppError> {
    let missing_direct_rows: i64 = transaction.query_row(
        "SELECT COUNT(*)
         FROM note_tag_links l
         LEFT JOIN tags t ON t.id = l.tag_id
         WHERE l.is_direct = 1 AND t.id IS NULL",
        [],
        |row| row.get(0),
    )?;

    if missing_direct_rows != 0 {
        return Err(AppError::custom(
            "Tag index rebuild failed verification: missing direct tag rows",
        ));
    }

    Ok(())
}

fn app_setting(conn: &Connection, key: &str) -> Result<Option<String>, rusqlite::Error> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
}

fn set_app_setting(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO app_settings (key, value)
         VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

trait TagIndexConn {
    fn execute<P: rusqlite::Params>(&self, sql: &str, params: P) -> Result<usize, rusqlite::Error>;
    fn query_row<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<T, rusqlite::Error>
    where
        P: rusqlite::Params,
        F: FnOnce(&rusqlite::Row<'_>) -> Result<T, rusqlite::Error>;
}

impl TagIndexConn for Connection {
    fn execute<P: rusqlite::Params>(&self, sql: &str, params: P) -> Result<usize, rusqlite::Error> {
        Connection::execute(self, sql, params)
    }

    fn query_row<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<T, rusqlite::Error>
    where
        P: rusqlite::Params,
        F: FnOnce(&rusqlite::Row<'_>) -> Result<T, rusqlite::Error>,
    {
        Connection::query_row(self, sql, params, f)
    }
}

impl TagIndexConn for Transaction<'_> {
    fn execute<P: rusqlite::Params>(&self, sql: &str, params: P) -> Result<usize, rusqlite::Error> {
        Connection::execute(&*self, sql, params)
    }

    fn query_row<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<T, rusqlite::Error>
    where
        P: rusqlite::Params,
        F: FnOnce(&rusqlite::Row<'_>) -> Result<T, rusqlite::Error>,
    {
        Connection::query_row(&*self, sql, params, f)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;

    #[test]
    fn rebuild_tag_index_populates_direct_and_ancestor_links() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES ('note-1', 'Title', '# Title\n\n#work/project alpha# #roadmap', 1, 2, 2, 1)",
            [],
        )
        .unwrap();

        ensure_tag_index_ready(&mut conn).unwrap();

        let direct: Vec<String> = {
            let mut stmt = conn
                .prepare(
                    "SELECT t.path
                     FROM note_tag_links l
                     JOIN tags t ON t.id = l.tag_id
                     WHERE l.note_id = 'note-1' AND l.is_direct = 1
                     ORDER BY t.path",
                )
                .unwrap();
            stmt.query_map([], |row| row.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert_eq!(
            direct,
            vec!["roadmap".to_string(), "work/project alpha".to_string()]
        );

        let derived: Vec<String> = {
            let mut stmt = conn
                .prepare(
                    "SELECT t.path
                     FROM note_tag_links l
                     JOIN tags t ON t.id = l.tag_id
                     WHERE l.note_id = 'note-1' AND l.is_direct = 0
                     ORDER BY t.path",
                )
                .unwrap();
            stmt.query_map([], |row| row.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert_eq!(derived, vec!["work".to_string()]);
    }

    #[test]
    fn repair_tag_index_returns_diagnostics() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES ('note-1', 'Title', '# Title\n\n#work/project alpha# #roadmap', 1, 2, 2, 1)",
            [],
        )
        .unwrap();

        let diagnostics = repair_tag_index(&mut conn).unwrap();

        assert_eq!(diagnostics.version.as_deref(), Some(TAG_INDEX_VERSION));
        assert_eq!(diagnostics.status.as_deref(), Some("ready"));
        assert_eq!(diagnostics.tag_count, 3);
        assert_eq!(diagnostics.direct_link_count, 2);
        assert_eq!(diagnostics.link_count, 3);
        assert!(diagnostics.last_rebuilt_at.is_some());
    }
}
