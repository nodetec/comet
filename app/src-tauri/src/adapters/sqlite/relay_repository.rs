use crate::domain::common::time::now_millis;
use crate::domain::relay::model::Relay;
use crate::domain::relay::service::normalize_relay_url;
use crate::error::AppError;
use rusqlite::{params, Connection};

pub fn list_relays(conn: &Connection) -> Result<Vec<Relay>, AppError> {
    let paused_sync_relays =
        crate::adapters::sqlite::sync_repository::list_paused_sync_relay_urls(conn);
    let preferred_sync_relay =
        crate::adapters::sqlite::sync_repository::get_preferred_sync_relay_url(conn);
    let active_sync_relay =
        crate::adapters::sqlite::sync_repository::get_active_sync_relay_url(conn);
    let mut stmt = conn.prepare("SELECT url, kind, created_at FROM relays ORDER BY created_at")?;
    let relays = stmt
        .query_map([], |row| {
            let url: String = row.get(0)?;
            let kind: String = row.get(1)?;
            Ok(Relay {
                paused: kind == "sync" && paused_sync_relays.contains(&url),
                preferred: kind == "sync"
                    && preferred_sync_relay
                        .as_ref()
                        .is_some_and(|preferred| preferred == &url),
                active: kind == "sync"
                    && active_sync_relay
                        .as_ref()
                        .is_some_and(|active| active == &url),
                url,
                kind,
                created_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(relays)
}

pub fn set_sync_relay(conn: &Connection, url: &str) -> Result<Vec<Relay>, AppError> {
    let url = normalize_relay_url(url)?;
    let now = now_millis();

    conn.execute(
        "INSERT OR IGNORE INTO relays (url, kind, created_at) VALUES (?1, 'sync', ?2)",
        params![url, now],
    )?;

    list_relays(conn)
}

pub fn remove_sync_relay(conn: &Connection, url: Option<&str>) -> Result<Vec<Relay>, AppError> {
    match url {
        Some(url) => {
            let url = normalize_relay_url(url)?;
            conn.execute(
                "DELETE FROM relays WHERE kind = 'sync' AND url = ?1",
                params![url],
            )?;
        }
        None => {
            conn.execute("DELETE FROM relays WHERE kind = 'sync'", [])?;
        }
    }
    list_relays(conn)
}

pub fn add_publish_relay(conn: &Connection, url: &str) -> Result<Vec<Relay>, AppError> {
    let url = normalize_relay_url(url)?;
    let now = now_millis();

    conn.execute(
        "INSERT INTO relays (url, kind, created_at) VALUES (?1, 'publish', ?2)",
        params![url, now],
    )
    .map_err(|_| AppError::custom(format!("Relay already added: {url}")))?;

    list_relays(conn)
}

pub fn remove_relay(conn: &Connection, url: &str, kind: &str) -> Result<Vec<Relay>, AppError> {
    conn.execute(
        "DELETE FROM relays WHERE url = ?1 AND kind = ?2",
        params![url, kind],
    )?;
    list_relays(conn)
}
